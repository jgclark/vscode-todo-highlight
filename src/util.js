var vscode = require('vscode');
var os = require("os");
var minimatch = require('minimatch');
var window = vscode.window;
var workspace = vscode.workspace;

var defaultIcon = '$(checklist)';
var zapIcon = '$(zap)';
var defaultMsg = '0';

var SeverityMap = {
    'error': vscode.DiagnosticSeverity.Error,
    'warning': vscode.DiagnosticSeverity.Warning,
    'information': vscode.DiagnosticSeverity.Information
};

var DEFAULT_KEYWORDS = {
    "TODO:": {
        // TEST: leaving just the 'text' property, to allow overriding the style for all keywords
        text: "TODO:",
        // color: '#fff',
        // backgroundColor: '#ffbd2a',
        // overviewRulerColor: 'rgba(255,189,42,0.8)',
        // diagnosticSeverity: 'error'
    },
    "FIXME:": {
        text: "FIXME:",
        // TEST: leaving just the 'text' property, to allow overriding the style for all keywords
        // color: '#fff',
        // backgroundColor: '#f06292',
        // overviewRulerColor: 'rgba(240,98,146,0.8)',
        // diagnosticSeverity: 'warning'
    }
};

const DEFAULT_STYLE = {
// TEST: turning this off entirely
// color: "#2196f3",
// backgroundColor: "#ffeb3b",
};

function getAssembledData(keywords, customDefaultStyle, isCaseSensitive) {
    let result = {}, regex = [], reg;
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
        v.diagnosticSeverity = SeverityMap[v.diagnosticSeverity]
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
function getPaths(config) {
    return Array.isArray(config) ?
        '{' + config.join(',') + ',' + '}'
        : (typeof config == 'string' ? config : '');
}

function isFileNameOk(filename) {

    const settings = workspace.getConfiguration('todohighlight');
    const includePatterns = getPaths(settings.get('include')) || '{**/*}';
    const excludePatterns = getPaths(settings.get('exclude'));

    if (minimatch(filename, includePatterns) && !minimatch(filename, excludePatterns)) {
        return true;
    }

    return false;
}


function searchAnnotations(workspaceState, pattern, callback) {

    const settings = workspace.getConfiguration('todohighlight');
    const includePattern = getPaths(settings.get('include')) || '{**/*}';
    const excludePattern = getPaths(settings.get('exclude'));
    const limitationForSearch = settings.get('maxFilesForSearch', 5120);

    const statusMsg = ` Searching...`;

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
    const fileInUri = file.uri.toString();
    const pathWithoutFile = fileInUri.substring(7, fileInUri.length);

    for (let line = 0; line < file.lineCount; line++) {
        const lineText = file.lineAt(line).text;
        const match = lineText.match(regexp);
        if (match !== null) {
            if (!annotations.hasOwnProperty(pathWithoutFile)) {
                annotations[pathWithoutFile] = [];
            }
            let content = getContent(lineText, match);
            if (content.length > 500) {
                content = content.substring(0, 500).trim() + '...';
            }
            const locationInfo = getLocationInfo(fileInUri, pathWithoutFile, lineText, line, match);

            const annotation = {
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

    const resultNum = annotationList.length;
    const tooltip = resultNum + ' result(s) found';
    setStatusMsg(defaultIcon, resultNum, tooltip);
    showOutputChannel(annotationList);
}

function showOutputChannel(data) {
    if (!window.outputChannel) return;
    window.outputChannel.clear();

    if (data.length === 0) {
        window.showInformationMessage('No results. (Not included file types and individual files are not searched.)');
        return;
    }

    const settings = workspace.getConfiguration('todohighlight');
    const toggleURI = settings.get('toggleURI', false);
    const platform = os.platform();

    data.forEach(function (v, i) {
        // due to an issue of vscode(https://github.com/Microsoft/vscode/issues/586), in order to make file path clickable within the output channel,the file path differs from platform
        const patternA = '#' + (i + 1) + '\t' + v.uri + '#' + (v.lineNum + 1);
        const patternB = '#' + (i + 1) + '\t' + v.uri + ':' + (v.lineNum + 1) + ':' + (v.startCol + 1);
        const patterns = [patternA, patternB];

        //for windows
        let patternType = 0;
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
    const rootPath = workspace.rootPath + '/';
    const outputFile = pathWithoutFile.replace(rootPath, '');
    const startCol = lineText.indexOf(match[0]);
    const endCol = lineText.length;
    const location = outputFile + ' ' + (line + 1) + ':' + (startCol + 1);

    return {
        uri: fileInUri,
        absPath: pathWithoutFile,
        relativePath: location,
        startCol: startCol,
        endCol: endCol
    };
};

function createStatusBarItem() {
    const statusBarItem = window.createStatusBarItem(vscode.StatusBarAlignment.Left);
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
    escapeRegExpGroupsLegacy,
    getContent,
    isFileNameOk
};
