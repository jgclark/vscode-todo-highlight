module.exports =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./src/extension.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./src/extension.js":
/*!**************************!*\
  !*** ./src/extension.js ***!
  \**************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

/**
 * vscode plugin for highlighting TODOs and FIXMEs within your code
 *
 * NOTE: each decoration type has a unique key, the highlight and clear highight functionality are based on it
 */

var vscode = __webpack_require__(/*! vscode */ "vscode");
var util = __webpack_require__(/*! ./util */ "./src/util.js");
var window = vscode.window;
var workspace = vscode.workspace;

function activate(context) {

    var timeout = null;
    var activeEditor = window.activeTextEditor;
    var isCaseSensitive, assembledData, decorationTypes, pattern, styleForRegExp, keywordsPattern;
    var workspaceState = context.workspaceState;

    var settings = workspace.getConfiguration('todohighlight');

    init(settings);

    context.subscriptions.push(vscode.commands.registerCommand('todohighlight.toggleHighlight', function () {
        settings.update('isEnable', !settings.get('isEnable'), true).then(function () {
            triggerUpdateDecorations();
        });
    }))

    context.subscriptions.push(vscode.commands.registerCommand('todohighlight.listAnnotations', function () {
        if (keywordsPattern.trim()) {
            util.searchAnnotations(workspaceState, pattern, util.annotationsFound);
        } else {
            if (!assembledData) return;
            var availableAnnotationTypes = Object.keys(assembledData);
            availableAnnotationTypes.unshift('ALL');
            util.chooseAnnotationType(availableAnnotationTypes).then(function (annotationType) {
                if (!annotationType) return;
                var searchPattern = pattern;
                if (annotationType != 'ALL') {
                    annotationType = util.escapeRegExp(annotationType);
                    searchPattern = new RegExp(annotationType, isCaseSensitive ? 'g' : 'gi');
                }
                util.searchAnnotations(workspaceState, searchPattern, util.annotationsFound);
            });
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('todohighlight.showOutputChannel', function () {
        var annotationList = workspaceState.get('annotationList', []);
        util.showOutputChannel(annotationList);
    }));

    if (activeEditor) {
        triggerUpdateDecorations();
    }

    window.onDidChangeActiveTextEditor(function (editor) {
        activeEditor = editor;
        if (editor) {
            triggerUpdateDecorations();
        }
    }, null, context.subscriptions);

    workspace.onDidChangeTextDocument(function (event) {
        if (activeEditor && event.document === activeEditor.document) {
            triggerUpdateDecorations();
        }
    }, null, context.subscriptions);

    workspace.onDidChangeConfiguration(function () {
        settings = workspace.getConfiguration('todohighlight');

        //NOTE: if disabled, do not re-initialize the data or we will not be able to clear the style immediatly via 'toggle highlight' command
        if (!settings.get('isEnable')) return;

        init(settings);
        triggerUpdateDecorations();
    }, null, context.subscriptions);

    function updateDecorations() {

        if (!activeEditor || !activeEditor.document) {
            return;
        }

        var text = activeEditor.document.getText();
        var matches = {}, match;
        while (match = pattern.exec(text)) {
            var startPos = activeEditor.document.positionAt(match.index);
            var endPos = activeEditor.document.positionAt(match.index + match[0].length);

            var decoration = {
                range: new vscode.Range(startPos, endPos)
            };

            var matchedValue = match[0];
            let patternIndex = match.slice(1).indexOf(matchedValue);
            matchedValue = Object.keys(decorationTypes)[patternIndex] || matchedValue;

            if (!isCaseSensitive) {
                matchedValue = matchedValue.toUpperCase();
            }

            if (matches[matchedValue]) {
                matches[matchedValue].push(decoration);
            } else {
                matches[matchedValue] = [decoration];
            }

            if (keywordsPattern.trim() && !decorationTypes[matchedValue]) {
                decorationTypes[matchedValue] = window.createTextEditorDecorationType(styleForRegExp);
            }
        }

        Object.keys(decorationTypes).forEach(v => {
            var rangeOption = settings.get('isEnable') && matches[v] ? matches[v] : [];
            var decorationType = decorationTypes[v];
            activeEditor.setDecorations(decorationType, rangeOption);
        })
    }

    function init(settings) {
        var customDefaultStyle = settings.get('defaultStyle');
        keywordsPattern = settings.get('keywordsPattern');
        isCaseSensitive = settings.get('isCaseSensitive', true);

        if (!window.statusBarItem) {
            window.statusBarItem = util.createStatusBarItem();
        }
        if (!window.outputChannel) {
            window.outputChannel = window.createOutputChannel('TodoHighlight');
        }

        decorationTypes = {};

        if (keywordsPattern.trim()) {
            styleForRegExp = Object.assign({}, util.DEFAULT_STYLE, customDefaultStyle, {
                overviewRulerLane: vscode.OverviewRulerLane.Right
            });

            pattern = keywordsPattern;
        } else {
            assembledData = util.getAssembledData(settings.get('keywords'), customDefaultStyle, isCaseSensitive);
            Object.keys(assembledData).forEach((v) => {
                if (!isCaseSensitive) {
                    v = v.toUpperCase()
                }

                var mergedStyle = Object.assign({}, {
                    overviewRulerLane: vscode.OverviewRulerLane.Right
                }, assembledData[v]);

                if (!mergedStyle.overviewRulerColor) {
                    // use backgroundColor as the default overviewRulerColor if not specified by the user setting
                    mergedStyle.overviewRulerColor = mergedStyle.backgroundColor;
                }

                decorationTypes[v] = window.createTextEditorDecorationType(mergedStyle);
            });

            // Give each keyword a group in the pattern
            pattern = Object.keys(assembledData).map((v) => {
                if (!assembledData[v].regex) {
                    return `(${util.escapeRegExp(v)})`;
                }

                let p = assembledData[v].regex.pattern || v;
                // Ignore unescaped parantheses to avoid messing with our groups
                return `(${util.escapeRegExpGroups(p)})`
            }).join('|');
        }

        pattern = new RegExp(pattern, 'gi');
        if (isCaseSensitive) {
            pattern = new RegExp(pattern, 'g');
        }

    }

    function triggerUpdateDecorations() {
        timeout && clearTimeout(timeout);
        timeout = setTimeout(updateDecorations, 0);
    }
}

exports.activate = activate;


/***/ }),

/***/ "./src/util.js":
/*!*********************!*\
  !*** ./src/util.js ***!
  \*********************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

var vscode = __webpack_require__(/*! vscode */ "vscode");
var os = __webpack_require__(/*! os */ "os");
var window = vscode.window;
var workspace = vscode.workspace;

var defaultIcon = '$(checklist)';
var zapIcon = '$(zap)';
var defaultMsg = '0';

var DEFAULT_KEYWORDS = {
    "TODO:": {
        text: "TODO:",
        color: '#fff',
        backgroundColor: '#ffbd2a',
        overviewRulerColor: 'rgba(255,189,42,0.8)'
    },
    "FIXME:": {
        text: "FIXME:",
        color: '#fff',
        backgroundColor: '#f06292',
        overviewRulerColor: 'rgba(240,98,146,0.8)'
    }
};

var DEFAULT_STYLE = {
    color: "#2196f3",
    backgroundColor: "#ffeb3b",
};

function getAssembledData(keywords, customDefaultStyle, isCaseSensitive) {
    var result = {}, regex = [], reg;
    keywords.forEach((v) => {
        v = typeof v == 'string' ? { text: v } : v;
        var text = v.text;
        if (!text) return;//NOTE: in case of the text is empty

        if (!isCaseSensitive) {
            text = text.toUpperCase();
        }

        if (text == 'TODO:' || text == 'FIXME:') {
            v = Object.assign({}, DEFAULT_KEYWORDS[text], v);
        }
        result[text] = Object.assign({}, DEFAULT_STYLE, customDefaultStyle, v);

        if (v.regex) {
            regex.push(regex.pattern||text);
        }
    })

    if (regex) {
        reg = regex.join('|');
    }

    // Don't override existing regex keywords with matching defaults
    Object.keys(DEFAULT_KEYWORDS).filter(v => {
        if (reg) {
            if (v.match(new RegExp(reg))) {
                return false;
            }
        }

        return true;
    }).forEach(v => {
        if (!result[v]) {
            result[v] = Object.assign({}, DEFAULT_STYLE, customDefaultStyle, DEFAULT_KEYWORDS[v]);
        }
    });

    return result;
}

function chooseAnnotationType(availableAnnotationTypes) {
    return window.showQuickPick(availableAnnotationTypes, {});
}

//get the include/exclude config
function getPathes(config) {
    return Array.isArray(config) ?
        '{' + config.join(',') + '}'
        : (typeof config == 'string' ? config : '');
}

function searchAnnotations(workspaceState, pattern, callback) {

    var settings = workspace.getConfiguration('todohighlight');
    var includePattern = getPathes(settings.get('include')) || '{**/*}';
    var excludePattern = getPathes(settings.get('exclude'));
    var limitationForSearch = settings.get('maxFilesForSearch', 5120);

    var statusMsg = ` Searching...`;

    window.processing = true;

    setStatusMsg(zapIcon, statusMsg);

    workspace.findFiles(includePattern, excludePattern, limitationForSearch).then(function (files) {

        if (!files || files.length === 0) {
            callback({ message: 'No files found' });
            return;
        }

        var totalFiles = files.length,
            progress = 0,
            times = 0,
            annotations = {},
            annotationList = [];

        function file_iterated() {
            times++;
            progress = Math.floor(times / totalFiles * 100);

            setStatusMsg(zapIcon, progress + '% ' + statusMsg);

            if (times === totalFiles || window.manullyCancel) {
                window.processing = true;
                workspaceState.update('annotationList', annotationList);
                callback(null, annotations, annotationList);
            }
        }

        for (var i = 0; i < totalFiles; i++) {

            workspace.openTextDocument(files[i]).then(function (file) {
                searchAnnotationInFile(file, annotations, annotationList, pattern);
                file_iterated();
            }, function (err) {
                errorHandler(err);
                file_iterated();
            });

        }
        
    }, function (err) {
        errorHandler(err);
    });
}

function searchAnnotationInFile(file, annotations, annotationList, regexp) {
    var fileInUri = file.uri.toString();
    var pathWithoutFile = fileInUri.substring(7, fileInUri.length);

    for (var line = 0; line < file.lineCount; line++) {
        var lineText = file.lineAt(line).text;
        var match = lineText.match(regexp);
        if (match !== null) {
            if (!annotations.hasOwnProperty(pathWithoutFile)) {
                annotations[pathWithoutFile] = [];
            }
            var content = getContent(lineText, match);
            if (content.length > 500) {
                content = content.substring(0, 500).trim() + '...';
            }
            var locationInfo = getLocationInfo(fileInUri, pathWithoutFile, lineText, line, match);

            var annotation = {
                uri: locationInfo.uri,
                label: content,
                detail: locationInfo.relativePath,
                lineNum: line,
                fileName: locationInfo.absPath,
                startCol: locationInfo.startCol,
                endCol: locationInfo.endCol
            };
            annotationList.push(annotation);
            annotations[pathWithoutFile].push(annotation);
        }
    }
}

function annotationsFound(err, annotations, annotationList) {
    if (err) {
        console.log('todohighlight err:', err);
        setStatusMsg(defaultIcon, defaultMsg);
        return;
    }

    var resultNum = annotationList.length;
    var tooltip = resultNum + ' result(s) found';
    setStatusMsg(defaultIcon, resultNum, tooltip);
    showOutputChannel(annotationList);
}

function showOutputChannel(data) {
    if (!window.outputChannel) return;
    window.outputChannel.clear();

    if (data.length === 0) {
        window.showInformationMessage('No results');
        return;
    }

    var settings = workspace.getConfiguration('todohighlight');
    var toggleURI = settings.get('toggleURI', false);
    var platform = os.platform();

    data.forEach(function (v, i) {
        // due to an issue of vscode(https://github.com/Microsoft/vscode/issues/586), in order to make file path clickable within the output channel,the file path differs from platform
        var patternA = '#' + (i + 1) + '\t' + v.uri + '#' + (v.lineNum + 1);
        var patternB = '#' + (i + 1) + '\t' + v.uri + ':' + (v.lineNum + 1) + ':' + (v.startCol + 1);
        var patterns = [patternA, patternB];

        //for windows
        var patternType = 0;
        if (platform == "linux" || platform == "darwin") {
            // for linux & mac
            patternType = 1;
        }
        if (toggleURI) {
            //toggle the pattern
            patternType = +!patternType;
        }
        window.outputChannel.appendLine(patterns[patternType]);
        window.outputChannel.appendLine('\t' + v.label + '\n');
    });
    window.outputChannel.show();
}

function getContent(lineText, match) {
    return lineText.substring(lineText.indexOf(match[0]), lineText.length);
};

function getLocationInfo(fileInUri, pathWithoutFile, lineText, line, match) {
    var rootPath = workspace.rootPath + '/';
    var outputFile = pathWithoutFile.replace(rootPath, '');
    var startCol = lineText.indexOf(match[0]);
    var endCol = lineText.length;
    var location = outputFile + ' ' + (line + 1) + ':' + (startCol + 1);

    return {
        uri: fileInUri,
        absPath: pathWithoutFile,
        relativePath: location,
        startCol: startCol,
        endCol: endCol
    };
};

function createStatusBarItem() {
    var statusBarItem = window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBarItem.text = defaultIcon + defaultMsg;
    statusBarItem.tooltip = 'List annotations';
    statusBarItem.command = 'todohighlight.showOutputChannel';
    return statusBarItem;
};

function errorHandler(err) {
    window.processing = true;
    setStatusMsg(defaultIcon, defaultMsg);
    console.log('todohighlight err:', err);
}

function setStatusMsg(icon, msg, tooltip) {
    if (window.statusBarItem) {
        window.statusBarItem.text = `${icon} ${msg}` || '';
        if (tooltip) {
            window.statusBarItem.tooltip = tooltip;
        }
        window.statusBarItem.show();
    }
}

function escapeRegExp(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function escapeRegExpGroups(s) {
    // Lookbehind assertions ("(?<!abc) & (?<=abc)") supported from ECMAScript 2018 and onwards. Native in node.js 9 and up.
    if (parseFloat(process.version.replace('v', '')) > 9.0) {
        let grpPattern = /(?<!\\)(\()([^?]\w*(?:\\+\w)*)(\))?/g;
        // Make group non-capturing
        return s.replace(grpPattern, '$1?:$2$3');
    } else {
        return escapeRegExpGroupsLegacy(s);
    }
}

function escapeRegExpGroupsLegacy(s) {
    return s.replace(/\(\?<[=|!][^)]*\)/g, '') // Remove any unsupported lookbehinds
        .replace(/((?:[^\\]{1}|^)(?:(?:[\\]{2})+)?)(\((?!\?[:|=|!]))([^)]*)(\))/g, '$1$2?:$3$4'); // Make all groups non-capturing
}

module.exports = {
    DEFAULT_STYLE,
    getAssembledData,
    chooseAnnotationType,
    searchAnnotations,
    annotationsFound,
    createStatusBarItem,
    setStatusMsg,
    showOutputChannel,
    escapeRegExp,
    escapeRegExpGroups,
    escapeRegExpGroupsLegacy
};


/***/ }),

/***/ "os":
/*!*********************!*\
  !*** external "os" ***!
  \*********************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = require("os");

/***/ }),

/***/ "vscode":
/*!*************************!*\
  !*** external "vscode" ***!
  \*************************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = require("vscode");

/***/ })

/******/ });
//# sourceMappingURL=extension.js.map