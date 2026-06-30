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

/**
 * Assembles keyword configuration into a lookup map with merged styles and default keywords.
 * @param {Array<string|object>} keywords - Keyword strings or objects with text/regex/style properties
 * @param {object} customDefaultStyle - User-defined default style applied to all keywords
 * @param {boolean} isCaseSensitive - Whether keyword keys should be uppercased
 * @returns {object} Map of keyword text to merged style/regex configuration
 */
function getAssembledData(keywords, customDefaultStyle, isCaseSensitive) {
    let result = {}, regex = [], reg;
    keywords.forEach((v) => {
        v = typeof v === 'string' ? { text: v } : v;
        var text = v.text;
        if (!text) return; // If text is empty

        if (!isCaseSensitive) {
            text = text.toUpperCase();
        }

        if (text === 'TODO:' || text === 'FIXME:') {
            v = Object.assign({}, DEFAULT_KEYWORDS[text], v);
        }
        v.diagnosticSeverity = SeverityMap[v.diagnosticSeverity]
        result[text] = Object.assign({}, DEFAULT_STYLE, customDefaultStyle, v);

        if (v.regex) {
            regex.push(v.regex.pattern || text);
        }
    })

    if (regex.length) {
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

/**
 * Prompts the user to pick an annotation type from a list.
 * @param {string[]} availableAnnotationTypes - Annotation types to choose from
 * @returns {Thenable<string|undefined>} Selected annotation type, or undefined if dismissed
 */
function chooseAnnotationType(availableAnnotationTypes) {
    return window.showQuickPick(availableAnnotationTypes, {});
}

/**
 * Formats include/exclude path config into a glob pattern string.
 * @param {string|string[]|undefined} config - Path pattern(s) from settings
 * @returns {string} Brace-wrapped glob pattern or raw string
 */
function getPaths(config) {
    return Array.isArray(config)
        ? `{${config.join(',')},}`
        : (typeof config === 'string' ? config : '');
}

/**
 * Checks whether a file path matches include/exclude glob settings.
 * @param {string} filename - Absolute or workspace-relative file path
 * @returns {boolean} True if the file should be processed
 */
function isFileNameOk(filename) {
    const settings = workspace.getConfiguration('todohighlight');
    const includePatterns = getPaths(settings.get('include')) || '{**/*}';
    const excludePatterns = getPaths(settings.get('exclude'));

    if (minimatch(filename, includePatterns) && !minimatch(filename, excludePatterns)) {
        return true;
    }

    return false;
}


/**
 * Searches workspace files for annotations matching a regex pattern.
 * @param {vscode.Memento} workspaceState - Extension workspace state for storing results
 * @param {RegExp} pattern - Pattern to match annotation keywords
 * @param {function(Error|null, object=, object[]=): void} callback - Called when search completes or fails
 */
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

        /** Advances search progress and finalizes results when all files are processed or cancelled. */
        function file_iterated() {
            times++;
            progress = Math.floor(times / totalFiles * 100);

            setStatusMsg(zapIcon, progress + '% ' + statusMsg);

            if (times === totalFiles || window.manullyCancel) {
                window.processing = false;
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
        callback(err);
    });
}

/**
 * Scans a single file for regex matches and appends results to annotation collections.
 * @param {vscode.TextDocument} file - Document to search
 * @param {object} annotations - Map of file paths to annotation arrays (mutated)
 * @param {object[]} annotationList - Flat list of all annotations (mutated)
 * @param {RegExp} regexp - Pattern to match
 */
function searchAnnotationInFile(file, annotations, annotationList, regexp) {
    const filePath = file.uri.fsPath;
    const fileInUri = file.uri.toString();
    const lineRegExp = new RegExp(
        regexp.source,
        regexp.flags.includes('g') ? regexp.flags : regexp.flags + 'g'
    );

    for (let line = 0; line < file.lineCount; line++) {
        const lineText = file.lineAt(line).text;
        let match;

        lineRegExp.lastIndex = 0;
        while ((match = lineRegExp.exec(lineText)) !== null) {
            if (!annotations.hasOwnProperty(filePath)) {
                annotations[filePath] = [];
            }
            let content = getContent(lineText, match);
            if (content.length > 500) {
                content = content.substring(0, 500).trim() + '...';
            }
            const locationInfo = getLocationInfo(file.uri, filePath, lineText, line, match);

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
            annotations[filePath].push(annotation);

            if (match[0].length === 0) {
                lineRegExp.lastIndex++;
            }
        }
    }
}

/**
 * Callback handler that updates status bar and output channel after a workspace search.
 * @param {Error|null} err - Search error, if any
 * @param {object} [annotations] - Map of file paths to annotation arrays
 * @param {object[]} [annotationList] - Flat list of annotations
 */
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

/**
 * Renders annotation search results in the output channel with clickable file links.
 * @param {object[]} data - Annotation objects with uri, label, lineNum, startCol
 */
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
        if (platform === "linux" || platform === "darwin") {
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

/**
 * Extracts annotation text from a line starting at the matched keyword.
 * @param {string} lineText - Full text of the line
 * @param {RegExpMatchArray} match - Regex match result
 * @returns {string} Substring from the match through end of line
 */
function getContent(lineText, match) {
    const start = match.index !== undefined ? match.index : lineText.indexOf(match[0]);
    return lineText.substring(start, lineText.length);
};

/**
 * Builds location metadata for an annotation match.
 * @param {vscode.Uri} fileUri - File URI
 * @param {string} filePath - Absolute file path
 * @param {string} lineText - Full text of the matched line
 * @param {number} line - Zero-based line index
 * @param {RegExpMatchArray} match - Regex match result
 * @returns {{uri: string, absPath: string, relativePath: string, startCol: number, endCol: number}}
 */
function getLocationInfo(fileUri, filePath, lineText, line, match) {
    const outputFile = workspace.asRelativePath(fileUri, false);
    const startCol = match.index !== undefined ? match.index : lineText.indexOf(match[0]);
    const endCol = lineText.length;
    const location = outputFile + ' ' + (line + 1) + ':' + (startCol + 1);

    return {
        uri: fileUri.toString(),
        absPath: filePath,
        relativePath: location,
        startCol: startCol,
        endCol: endCol
    };
};

/**
 * Creates and configures the extension status bar item.
 * @returns {vscode.StatusBarItem} Status bar item bound to showOutputChannel command
 */
function createStatusBarItem() {
    const statusBarItem = window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBarItem.text = defaultIcon + defaultMsg;
    statusBarItem.tooltip = 'List annotations';
    statusBarItem.command = 'todohighlight.showOutputChannel';
    return statusBarItem;
};

/**
 * Resets status bar state and logs an error during workspace search.
 * @param {Error|string} err - Error to log
 */
function errorHandler(err) {
    window.processing = false;
    setStatusMsg(defaultIcon, defaultMsg);
    console.log('todohighlight err:', err);
}

/**
 * Updates the status bar text, optional tooltip, and shows the item.
 * @param {string} icon - Codicon or text prefix for the status bar
 * @param {string} msg - Message displayed in the status bar
 * @param {string} [tooltip] - Optional tooltip text
 */
function setStatusMsg(icon, msg, tooltip) {
    if (window.statusBarItem) {
        window.statusBarItem.text = `${icon} ${msg}` || '';
        if (tooltip) {
            window.statusBarItem.tooltip = tooltip;
        }
        window.statusBarItem.show();
    }
}

/**
 * Escapes special regex characters in a plain string.
 * @param {string} s - String to escape
 * @returns {string} Regex-safe string
 */
function escapeRegExp(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * Wraps a keyword regex pattern with word boundaries so only whole words match.
 * A `\b` is only added on sides where the keyword starts/ends with a word character
 * (e.g. so `BUG:` does not also match the `BUG:` inside `DEBUG:`). For issue #104.
 * @param {string} pattern - Escaped regex pattern for the keyword
 * @param {string} keyword - Original keyword text
 * @returns {string} Pattern with optional leading/trailing word boundaries
 */
function wholeWordPattern(pattern, keyword) {
    const prefix = /^\w/.test(keyword) ? '\\b' : ''
    const suffix = /\w$/.test(keyword) ? '\\b' : ''
    return prefix + pattern + suffix
}

/**
 * Converts capturing groups in a regex pattern to non-capturing groups (Node.js 10+).
 * @param {string} s - Regex pattern string
 * @returns {string} Pattern with non-capturing groups
 */
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

/**
 * Legacy fallback for escapeRegExpGroups on Node.js 9 and below.
 * @param {string} s - Regex pattern string
 * @returns {string} Pattern with unsupported lookbehinds removed and non-capturing groups
 */
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
    wholeWordPattern,
    escapeRegExpGroups,
    escapeRegExpGroupsLegacy,
    getContent,
    isFileNameOk
};
