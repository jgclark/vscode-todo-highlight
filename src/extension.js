/**
 * vscode plugin for highlighting TODOs and FIXMEs within your code
 *
 * NOTE: each decoration type has a unique key, the highlight and clear highight functionality are based on it
 */

var vscode = require('vscode');
var util = require('./util');
var window = vscode.window;
var workspace = vscode.workspace;

function activate(context) {

    var timeout = null;
    let activeEditor = window.activeTextEditor;
    var isCaseSensitive, assembledData, decorationTypes, pattern, styleForRegExp, keywordsPattern;
    const workspaceState = context.workspaceState;
    const currentDocument = vscode.window.activeTextEditor.document;

    // Get the configuration
    // let settings = workspace.getConfiguration('todohighlight');
    // Get the configuration for the current document (TEST: hoping this helps gives us multi-root support)
    let settings = workspace.getConfiguration('todohighlight', currentDocument.uri);

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
        const annotationList = workspaceState.get('annotationList', []);
        util.showOutputChannel(annotationList);
    }));

    var diagnostics = vscode.languages.createDiagnosticCollection('todohighlight');
    context.subscriptions.push(diagnostics);

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

    workspace.onDidCloseTextDocument(function (event) {
        diagnostics.set(event.document, [])
    }, null, context.subscriptions);

    workspace.onDidChangeConfiguration(function () {
        settings = workspace.getConfiguration('todohighlight');

        //NOTE: if disabled, do not re-initialize the data or we will not be able to clear the style immediatly via 'toggle highlight' command
        if (!settings.get('isEnable')) return;

        init(settings);
        triggerUpdateDecorations();
    }, null, context.subscriptions);

    function createDiagnostic(document, range, match, matchedValue) {
        var lineText = document.lineAt(range.start).text;
        var content = util.getContent(lineText, match);
        if (content.length > 160) {
            content = content.substring(0, 160).trim() + '...';
        }
        var severity = assembledData[matchedValue]?.diagnosticSeverity;
        if (severity !== null && severity !== undefined) {
            return new vscode.Diagnostic(range, content, severity);
        }
    }

    function updateDecorations() {

        if (!activeEditor || !activeEditor.document) {
            return;
        }

        // the function isFileNameOk checks for the include and exclude settings
        if (!util.isFileNameOk(activeEditor.document.fileName)) {
            return;
        }

        let problems = [];
        const postDiagnostics = settings.get('isEnable') && settings.get('enableDiagnostics');

        const text = activeEditor.document.getText();
        let matches = {}, match;
        while (match = pattern.exec(text)) {
            const startPos = activeEditor.document.positionAt(match.index);
            const endPos = activeEditor.document.positionAt(match.index + match[0].length);

            const decoration = {
                range: new vscode.Range(startPos, endPos)
            };

            let matchedValue = match[0];
            let patternIndex = match.slice(1).indexOf(matchedValue);
            matchedValue = Object.keys(decorationTypes)[patternIndex] || matchedValue;

            if (postDiagnostics) {
                const problem = createDiagnostic(activeEditor.document, decoration.range, match, matchedValue);
                if (problem) {
                    problems.push(problem);
                }
            }

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
            const rangeOption = settings.get('isEnable') && matches[v] ? matches[v] : [];
            const decorationType = decorationTypes[v];
            activeEditor.setDecorations(decorationType, rangeOption);
        })

        diagnostics.set(activeEditor.document.uri, problems);
    }

    function init(settings) {
        const customDefaultStyle = settings.get('defaultStyle');
        keywordsPattern = settings.get('keywordsPattern');
        isCaseSensitive = settings.get('isCaseSensitive', true);

        if (!window.statusBarItem) {
            window.statusBarItem = util.createStatusBarItem();
        }
        if (!window.outputChannel) {
            window.outputChannel = window.createOutputChannel('TodoHighlight');
        }

        // Dispose of old decoration types before creating new ones
        if (decorationTypes) {
            Object.keys(decorationTypes).forEach(key => {
                decorationTypes[key].dispose();
            });
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
