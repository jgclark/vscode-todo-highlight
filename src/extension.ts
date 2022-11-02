/**
 * vscode plugin for highlighting TODOs and FIXMEs within your code
 *
 * NOTE: each decoration type has a unique key, the highlight and clear highight functionality are based on it
 */

import * as vscode from 'vscode';
import { window, workspace } from 'vscode';
import { configurations, SeverityMap } from './config';
import type { Keyword } from './config';
import { annotationsFound, chooseAnnotationType, createStatusBarItem, DEFAULT_STYLE, escapeRegExp, escapeRegExpGroups, getAssembledData, globalState, isRegexKeyword, searchAnnotations, getContent } from './util';

function activate(context: vscode.ExtensionContext) {

    let timeout: NodeJS.Timer | null = null;
    let activeEditor = window.activeTextEditor;
    let isCaseSensitive: boolean | undefined;
    let assembledData: { [key: string]: Keyword };
    let decorationTypes: { [x: string]: vscode.TextEditorDecorationType; };
    let pattern: RegExp;
    let styleForRegExp: vscode.DecorationRenderOptions;
    let keywordsPattern: string;

    let workspaceState = context.workspaceState;

    const settings = configurations;

    init();

    context.subscriptions.push(vscode.commands.registerCommand('todohighlight.toggleHighlight', function () {
        settings.update('isEnable', !settings.get('isEnable'), true).then(function () {
            triggerUpdateDecorations();
        });
    }))

    context.subscriptions.push(vscode.commands.registerCommand('todohighlight.listAnnotations', function () {
        if (keywordsPattern.trim()) {
            searchAnnotations(workspaceState, pattern, annotationsFound);
        } else {
            if (!assembledData) return;
            let availableAnnotationTypes = Object.keys(assembledData);
            availableAnnotationTypes.unshift('ALL');
            chooseAnnotationType(availableAnnotationTypes).then(function (annotationType) {
                if (!annotationType) return;
                let searchPattern = pattern;
                if (annotationType != 'ALL') {
                    annotationType = escapeRegExp(annotationType);
                    searchPattern = new RegExp(annotationType, isCaseSensitive ? 'g' : 'gi');
                }
                searchAnnotations(workspaceState, searchPattern, annotationsFound);
            });
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('todohighlight.showOutputChannel', function () {
        let annotationList = workspaceState.get('annotationList', []);
        showOutputChannel(annotationList);
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
        diagnostics.set(event.uri, [])
    }, null, context.subscriptions);

    workspace.onDidChangeConfiguration(function () {
        //NOTE: if disabled, do not re-initialize the data or we will not be able to clear the style immediatly via 'toggle highlight' command
        if (!configurations.get('isEnable')) return;

        init();
        triggerUpdateDecorations();
    }, null, context.subscriptions);

    function createDiagnostic(document: vscode.TextDocument, range: vscode.Range, match: string[], matchedValue: string) {
        var lineText = document.lineAt(range.start).text;
        var content = getContent(lineText, match);
        if (content.length > 160) {
            content = content.substring(0, 160).trim() + '...';
        }
        var severity = assembledData[matchedValue]?.diagnosticSeverity;
        if (severity !== null && severity !== undefined) {
            return new vscode.Diagnostic(range, content, SeverityMap[severity]);
        }
    }

    function updateDecorations() {
        if (!activeEditor || !activeEditor.document) {
            return;
        }

        var problems = [];
        var postDiagnostics = settings.get('isEnable') && settings.get('enableDiagnostics');

        let text = activeEditor.document.getText();
        let matches: { [key: string]: any; } = {}, match;
        while (match = pattern.exec(text)) {
            const startPos = activeEditor.document.positionAt(match.index);
            const endPos = activeEditor.document.positionAt(match.index + match[0].length);

            const decoration = {
                range: new vscode.Range(startPos, endPos)
            };

            let matchedValue = match[0];
            const patternIndex = match.slice(1).indexOf(matchedValue);
            matchedValue = Object.keys(decorationTypes)[patternIndex] || matchedValue;

            if (postDiagnostics) {
                var problem = createDiagnostic(activeEditor.document, decoration.range, match, matchedValue);
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
            let rangeOption = settings.get('isEnable') && matches[v] ? matches[v] : [];
            let decorationType = decorationTypes[v];
            activeEditor!.setDecorations(decorationType, rangeOption);  // FIXME: remove `!`. activeEditor is defined. for some reason, TS doesn't see it. 
        })

        diagnostics.set(activeEditor.document.uri, problems);
    }

    function init() {
        const customDefaultStyle = configurations.get('defaultStyle', DEFAULT_STYLE);
        keywordsPattern = configurations.get('keywordsPattern', "");
        isCaseSensitive = configurations.get('isCaseSensitive', true);

        if (!globalState.statusBarItem) {
            globalState.statusBarItem = createStatusBarItem();
        }
        if (!globalState.outputChannel) {
            globalState.outputChannel = window.createOutputChannel('TodoHighlight');
        }

        decorationTypes = {};

        let stringPattern: string;
        if (keywordsPattern.trim()) {
            styleForRegExp = Object.assign({}, DEFAULT_STYLE, customDefaultStyle, {
                overviewRulerLane: vscode.OverviewRulerLane.Right
            });

            stringPattern = keywordsPattern;
        } else {
            assembledData = getAssembledData(configurations.get('keywords', []), customDefaultStyle, isCaseSensitive);
            Object.keys(assembledData).forEach((v) => {
                if (!isCaseSensitive) {
                    v = v.toUpperCase()
                }

                const mergedStyle = Object.assign({}, {
                    overviewRulerLane: vscode.OverviewRulerLane.Right
                }, assembledData[v]);

                if (!mergedStyle.overviewRulerColor) {
                    // use backgroundColor as the default overviewRulerColor if not specified by the user setting
                    mergedStyle.overviewRulerColor = mergedStyle.backgroundColor;
                }

                decorationTypes[v] = window.createTextEditorDecorationType(mergedStyle);
            });

            // Give each keyword a group in the pattern
            stringPattern = Object.keys(assembledData).map((v) => {
                const keyword = assembledData[v];
                if (isRegexKeyword(keyword)) {
                    const p = keyword.regex.pattern ?? v;
                    // Ignore unescaped parantheses to avoid messing with our groups
                    return `(${escapeRegExpGroups(p)})`
                }
                else {
                    return `(${escapeRegExp(v)})`;
                }
            }).join('|');
        }

        if (isCaseSensitive) {
            pattern = new RegExp(stringPattern, 'g');
        } else {
            pattern = new RegExp(stringPattern, 'gi');
        }

    }

    function triggerUpdateDecorations() {
        timeout && clearTimeout(timeout);
        timeout = setTimeout(updateDecorations, 0);
    }
}

exports.activate = activate;

function showOutputChannel(annotationList: never[]) {
    throw new Error('Function not implemented.');
}

