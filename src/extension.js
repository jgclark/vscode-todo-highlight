/**
 * vscode plugin for highlighting TODOs and FIXMEs within your code
 *
 * NOTE: each decoration type has a unique key, the highlight and clear highight functionality are based on it
 */

var vscode = require('vscode');
var util = require('./util');
var window = vscode.window;
var workspace = vscode.workspace;

/**
 * Activates the Todo Highlight extension: registers commands, listeners, and decoration updates.
 * @param {vscode.ExtensionContext} context - Extension activation context
 */
function activate(context) {
    util.initLogChannel(context);
    util.log('TODO Highlight v2 activated');

    var timeout = null;
    let activeEditor = window.activeTextEditor;
    var isCaseSensitive, assembledData, decorationTypes, pattern, styleForRegExp, keywordsPattern, wholeWordMatch;
    const workspaceState = context.workspaceState;
    const activeDocument = vscode.window.activeTextEditor?.document;

    // Get the configuration for the current document (multi-root support)
    let settings = util.getEffectiveConfiguration(activeDocument?.uri);

    init(activeDocument?.uri);

    const refreshConfigWatchers = util.watchConfigFiles(context, function () {
        settings = util.getEffectiveConfiguration(activeEditor?.document?.uri);
        if (settings.get('isEnable')) {
            init(activeEditor?.document?.uri);
            triggerUpdateDecorations();
        }
    });

    function reloadFromWorkspace(resourceUri) {
        util.invalidateConfigCache();
        refreshConfigWatchers();
        settings = util.getEffectiveConfiguration(resourceUri);
        if (settings.get('isEnable')) {
            init(resourceUri);
            triggerUpdateDecorations();
        }
    }

    if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
        util.log('todohighlight: waiting for a workspace folder before loading config');
        workspace.onDidChangeWorkspaceFolders(function () {
            if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
                reloadFromWorkspace(activeEditor?.document?.uri);
            }
        }, null, context.subscriptions);
    }

    context.subscriptions.push(vscode.commands.registerCommand('todohighlight.toggleHighlight', function () {
        settings.vscode.update('isEnable', !settings.get('isEnable'), true).then(function () {
            triggerUpdateDecorations();
        });
    }))

    context.subscriptions.push(vscode.commands.registerCommand('todohighlight.listAnnotations', function () {
        if (keywordsPattern.trim()) {
            util.searchAnnotations(workspaceState, pattern, util.annotationsFound, activeEditor?.document?.uri);
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
                util.searchAnnotations(workspaceState, searchPattern, util.annotationsFound, activeEditor?.document?.uri);
            });
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('todohighlight.showLog', function () {
        util.showLogChannel();
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
        settings = util.getEffectiveConfiguration(editor?.document?.uri);
        if (editor) {
            init(editor.document.uri);
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

    workspace.onDidChangeConfiguration(function (event) {
        if (!event.affectsConfiguration('todohighlight')) {
            return;
        }

        util.log('todohighlight: settings changed, reloading config');
        reloadFromWorkspace(activeEditor?.document?.uri);
    }, null, context.subscriptions);

    /**
     * Creates a diagnostic for a matched annotation when severity is configured.
     * @param {vscode.TextDocument} document - Document containing the match
     * @param {vscode.Range} range - Range of the matched keyword
     * @param {RegExpMatchArray} match - Regex match result
     * @param {string} matchedValue - Resolved keyword key for style/severity lookup
     * @returns {vscode.Diagnostic|undefined} Diagnostic if severity is set
     */
    function createDiagnostic(document, range, match, matchedValue) {
        var lineText = document.lineAt(range.start).text;
        // match.index is document-relative; getContent expects a line-relative index
        var content = util.getContent(lineText, { 0: match[0], index: range.start.character });
        if (content.length > 160) {
            content = content.substring(0, 160).trim() + '...';
        }
        if (!content) {
            content = matchedValue || match[0];
        }
        var severity = assembledData[matchedValue]?.diagnosticSeverity;
        if (severity !== null && severity !== undefined) {
            return new vscode.Diagnostic(range, content, severity);
        }
    }

    /** Finds annotation matches in the active editor and applies decorations and diagnostics. */
    function updateDecorations() {
        if (!activeEditor || !activeEditor.document) {
            return;
        }

        // the function isFileNameOk checks for the include and exclude settings
        if (!util.isFileNameOk(activeEditor.document.uri, settings)) {
            if (decorationTypes) {
                Object.keys(decorationTypes).forEach(v => {
                    activeEditor.setDecorations(decorationTypes[v], []);
                });
            }
            diagnostics.set(activeEditor.document.uri, []);
            return;
        }

        let problems = [];
        const postDiagnostics = settings.get('isEnable') && settings.get('enableDiagnostics');

        const text = activeEditor.document.getText();
        let matches = {}, match;
        pattern.lastIndex = 0;
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

    /**
     * Strips keyword-specific fields that are not valid DecorationRenderOptions.
     * @param {object} keywordConfig - Merged keyword configuration
     * @returns {object} Style properties safe for createTextEditorDecorationType
     */
    function decorationStyleFromKeyword(keywordConfig) {
        const style = Object.assign({}, keywordConfig);
        delete style.text;
        delete style.wholeWord;
        delete style.regex;
        delete style.diagnosticSeverity;
        return style;
    }

    /**
     * Loads settings, (re)creates decoration types, and builds the search regex pattern.
     * @param {vscode.Uri|undefined} resourceUri - Document URI for scoped settings
     */
    function init(resourceUri) {
        settings = util.getEffectiveConfiguration(resourceUri);
        const customDefaultStyle = settings.get('defaultStyle');
        keywordsPattern = settings.get('keywordsPattern');
        isCaseSensitive = settings.get('isCaseSensitive', true);
        wholeWordMatch = settings.get('wholeWordMatch', false);

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
                }, decorationStyleFromKeyword(assembledData[v]));

                if (!mergedStyle.overviewRulerColor) {
                    // use backgroundColor as the default overviewRulerColor if not specified by the user setting
                    mergedStyle.overviewRulerColor = mergedStyle.backgroundColor;
                }

                decorationTypes[v] = window.createTextEditorDecorationType(mergedStyle);
            });

            // Give each keyword a group in the pattern
            pattern = Object.keys(assembledData).map((v) => {
                // A per-keyword `wholeWord` setting overrides the global `wholeWordMatch`
                const useWholeWord = assembledData[v].wholeWord !== undefined ? assembledData[v].wholeWord : wholeWordMatch;

                if (!assembledData[v].regex) {
                    let p = util.escapeRegExp(v);
                    if (useWholeWord) {
                        p = util.wholeWordPattern(p, v);
                    }
                    return `(${p})`;
                }

                let p = assembledData[v].regex.pattern || v;
                // Ignore unescaped parantheses to avoid messing with our groups
                return `(${util.escapeRegExpGroups(p)})`
            }).join('|');
        }

        const patternFlags = isCaseSensitive ? 'g' : 'gi';
        pattern = new RegExp(pattern, patternFlags);
    }

    /** Debounces decoration updates on the next tick to batch rapid editor changes. */
    function triggerUpdateDecorations() {
        timeout && clearTimeout(timeout);
        timeout = setTimeout(updateDecorations, 0);
    }
}

exports.activate = activate;
