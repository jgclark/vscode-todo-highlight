import * as vscode from 'vscode';
import { DecorationRenderOptions, window, workspace } from 'vscode';
import * as os from 'os';
import { configurations } from './config';
import type { Keyword, RegExpKeyword, TextKeyword } from './config';

const defaultIcon = '$(checklist)';
const zapIcon = '$(zap)';
const defaultMsg = '0';

const DEFAULT_KEYWORDS: { [key: string]: Keyword } = {
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

export const DEFAULT_STYLE = {
    color: "#2196f3",
    backgroundColor: "#ffeb3b",
};

// FIXME: globalState replaces `window` in the original code.
export const globalState:
    {
        processing: boolean;
        statusBarItem: vscode.StatusBarItem | null;
        outputChannel: vscode.OutputChannel | null;
        manullyCancel: boolean;
    } = {
    processing: false,
    statusBarItem: null,
    outputChannel: null,
    manullyCancel: false
};

export function isTextKeyword(v: any): v is TextKeyword {
    return v && v.text && v.regex === undefined;
}

export function isRegexKeyword(v: any): v is RegExpKeyword {
    return v && v.regex;
}

export function getAssembledData(keywords: (string | Keyword)[], customDefaultStyle: DecorationRenderOptions, isCaseSensitive: boolean): { [key: string]: Keyword } {
    const result: Record<string, Keyword> = {};
    const regex: string[] = [];
    keywords.forEach((v) => {
        v = typeof v == 'string' ? { text: v } : v;
        const text = isCaseSensitive ? v.text : v.text.toUpperCase();
        if (!text) return; //NOTE: in case of the text is empty

        if (text == 'TODO:' || text == 'FIXME:') {
            v = Object.assign({}, DEFAULT_KEYWORDS[text], v);
        }
        result[text] = Object.assign({}, DEFAULT_STYLE, customDefaultStyle, v);

        if (isRegexKeyword(v)) {
            regex.push(v.regex.pattern ?? text);
        }
    })

    const reg = regex ? regex.join('|') : undefined;

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

export function chooseAnnotationType(availableAnnotationTypes: string[]) {
    return window.showQuickPick(availableAnnotationTypes, {});
}

//get the include/exclude config
function getPathes(config: string[] | string) {
    return Array.isArray(config) ? '{' + config.join(',') + '}' : config;
}

export function searchAnnotations(workspaceState: vscode.Memento, pattern: RegExp,
    callback: (err: { message: string } | null, annotations?: { [key: string]: Annotation }, annotationList?: Annotation[]) => void) {

    let includePattern = getPathes(configurations.get('include', [])) || '{**/*}';
    let excludePattern = getPathes(configurations.get('exclude', []));
    let limitationForSearch = configurations.get('maxFilesForSearch', 5120);

    let statusMsg = ` Searching...`;

    globalState.processing = true;

    setStatusMsg(zapIcon, statusMsg);

    workspace.findFiles(includePattern, excludePattern, limitationForSearch).then(function (files) {

        if (!files || files.length === 0) {
            callback({ message: 'No files found' });
            return;
        }

        let totalFiles = files.length,
            progress = 0,
            times = 0,
            annotations = {},
            annotationList: Annotation[] = [];

        function file_iterated() {
            times++;
            progress = Math.floor(times / totalFiles * 100);

            setStatusMsg(zapIcon, progress + '% ' + statusMsg);

            if (times === totalFiles || globalState.manullyCancel) {
                globalState.processing = true;
                workspaceState.update('annotationList', annotationList);
                callback(null, annotations, annotationList);
            }
        }

        for (let i = 0; i < totalFiles; i++) {

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

interface Annotation {
    uri: string;
    label: string;
    detail: string;
    lineNum: number;
    fileName: string;
    startCol: number;
    endCol: number;
};

function searchAnnotationInFile(file: vscode.TextDocument, annotations: { [key: string]: Annotation[] }, annotationList: Annotation[], regexp: RegExp) {
    let fileInUri = file.uri.toString();
    let pathWithoutFile = fileInUri.substring(7, fileInUri.length);

    for (let line = 0; line < file.lineCount; line++) {
        let lineText = file.lineAt(line).text;
        let match = lineText.match(regexp);
        if (match !== null) {
            if (!annotations.hasOwnProperty(pathWithoutFile)) {
                annotations[pathWithoutFile] = [];
            }
            let content = getContent(lineText, match);
            if (content.length > 500) {
                content = content.substring(0, 500).trim() + '...';
            }
            let locationInfo = getLocationInfo(fileInUri, pathWithoutFile, lineText, line, match);

            let annotation: Annotation = {
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

export function annotationsFound(err: { message: string } | null, annotations?: any, annotationList?: Annotation[]) {
    if (err) {
        console.log('todohighlight err:', err);
        setStatusMsg(defaultIcon, defaultMsg);
        return;
    }
    if (!annotationList) return;

    const resultNum = annotationList.length;
    const tooltip = resultNum + ' result(s) found';
    setStatusMsg(defaultIcon, `${resultNum}`, tooltip);
    showOutputChannel(annotationList);
}

function showOutputChannel(data: Annotation[]) {
    if (!globalState.outputChannel) return;
    globalState.outputChannel.clear();

    if (data.length === 0) {
        window.showInformationMessage('No results. (Not included file types and individual files are not searched.)');
        return;
    }

    let settings = workspace.getConfiguration('todohighlight');
    let toggleURI = settings.get('toggleURI', false);
    let platform = os.platform();

    data.forEach(function (v, i) {
        // due to an issue of vscode(https://github.com/Microsoft/vscode/issues/586), in order to make file path clickable within the output channel,the file path differs from platform
        let patternA = '#' + (i + 1) + '\t' + v.uri + '#' + (v.lineNum + 1);
        let patternB = '#' + (i + 1) + '\t' + v.uri + ':' + (v.lineNum + 1) + ':' + (v.startCol + 1);
        let patterns = [patternA, patternB];

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
        globalState.outputChannel!.appendLine(patterns[patternType]);  // FIXME: outputChannel is defined. TS does not see it.
        globalState.outputChannel!.appendLine('\t' + v.label + '\n');  // FIXME: outputChannel is defined. TS does not see it.
    });
    globalState.outputChannel.show();
}

function getContent(lineText: string, match: string[]) {
    return lineText.substring(lineText.indexOf(match[0]), lineText.length);
};

function getLocationInfo(fileInUri: string, pathWithoutFile: string, lineText: string, line: number, match: string[]) {
    const rootPath = workspace.rootPath + '/';  // TODO: rootPath is deprecated.
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

export function createStatusBarItem() {
    let statusBarItem = window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBarItem.text = defaultIcon + defaultMsg;
    statusBarItem.tooltip = 'List annotations';
    statusBarItem.command = 'todohighlight.showOutputChannel';
    return statusBarItem;
};

function errorHandler(err: Error) {
    globalState.processing = true;
    setStatusMsg(defaultIcon, defaultMsg);
    console.log('todohighlight err:', err);
}

function setStatusMsg(icon: string, msg: string, tooltip?: string) {
    if (globalState.statusBarItem) {
        globalState.statusBarItem.text = `${icon} ${msg}` || '';
        if (tooltip) {
            globalState.statusBarItem.tooltip = tooltip;
        }
        globalState.statusBarItem.show();
    }
}

export function escapeRegExp(s: string) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export function escapeRegExpGroups(s: string) {
    // Lookbehind assertions ("(?<!abc) & (?<=abc)") supported from ECMAScript 2018 and onwards. Native in node.js 9 and up.
    if (parseFloat(process.version.replace('v', '')) > 9.0) {
        let grpPattern = /(?<!\\)(\()([^?]\w*(?:\\+\w)*)(\))?/g;
        // Make group non-capturing
        return s.replace(grpPattern, '$1?:$2$3');
    } else {
        return escapeRegExpGroupsLegacy(s);
    }
}

export function escapeRegExpGroupsLegacy(s: string) {
    return s.replace(/\(\?<[=|!][^)]*\)/g, '') // Remove any unsupported lookbehinds
        .replace(/((?:[^\\]{1}|^)(?:(?:[\\]{2})+)?)(\((?!\?[:|=|!]))([^)]*)(\))/g, '$1$2?:$3$4'); // Make all groups non-capturing
}

