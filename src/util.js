var vscode = require('vscode');
var os = require("os");
var fs = require('fs');
var path = require('path');
var minimatch = require('minimatch');
var jsonc = require('jsonc-parser');
var window = vscode.window;
var workspace = vscode.workspace;

const CONFIG_FILE_NAMES = ['.todohighlight.json', '.todohighlight.jsonc'];

const CONFIG_KEYS = [
    'isEnable',
    'isCaseSensitive',
    'wholeWordMatch',
    'toggleURI',
    'keywords',
    'keywordsPattern',
    'defaultStyle',
    'include',
    'exclude',
    'maxFilesForSearch',
    'enableDiagnostics'
];

const configFileCache = {};

var logChannel = null;
var outputDecorationTypes = {};
var lastOutputDecorationState = null;
var outputDecorationRetryTimer = null;
var outputVisibilityListener = null;
var ANNOTATIONS_OUTPUT_CHANNEL_NAME = 'TodoHighlight';
var LINES_PER_ANNOTATION = 3;

/**
 * Creates the log output channel and registers it for disposal.
 * @param {vscode.ExtensionContext} context - Extension activation context
 */
function initLogChannel(context) {
    if (!logChannel) {
        logChannel = window.createOutputChannel('TODO Highlight v2');
        context.subscriptions.push(logChannel);
    }
    ensureOutputVisibilityListener(context);
}

/**
 * Re-applies annotation colours when the TodoHighlight output editor becomes visible.
 * @param {vscode.ExtensionContext} context - Extension activation context
 */
function ensureOutputVisibilityListener(context) {
    if (outputVisibilityListener) {
        return;
    }
    outputVisibilityListener = window.onDidChangeVisibleTextEditors(function () {
        if (lastOutputDecorationState) {
            applyOutputChannelDecorations(
                lastOutputDecorationState.data,
                lastOutputDecorationState.styleContext,
                lastOutputDecorationState.rangesByKey
            );
        }
    });
    context.subscriptions.push(outputVisibilityListener);
}

/**
 * Shows the log output channel.
 */
function showLogChannel() {
    if (logChannel) {
        logChannel.show(true);
    }
}

/**
 * Whether config debug messages are also written to the Extension Host log.
 * @returns {boolean}
 */
function isDebugLogEnabled() {
    return workspace.getConfiguration('todohighlight').get('debugLog', true);
}

/**
 * Writes a message to the log output channel (and Extension Host when debugLog is on).
 * @param {string} message - Log message
 */
function log(message) {
    if (logChannel) {
        logChannel.appendLine(message);
    }
    if (isDebugLogEnabled()) {
        console.error('[TODO Highlight v2] ' + message);
    }
}

/**
 * Writes an error message to the Todo Highlight output channel.
 * @param {string} message - Error message
 * @param {Error|*} [err] - Optional error object
 */
function logError(message, err) {
    log(message);
    if (err !== undefined && logChannel) {
        logChannel.appendLine(String(err));
    }
    if (err !== undefined && isDebugLogEnabled()) {
        console.error(err);
    }
}

/**
 * Logs config file watcher registration with explicit found / not-found status.
 * @param {{ folderPath: string, target: string, exists: boolean }} options
 */
function logConfigWatch({ folderPath, target, exists }) {
    const status = exists ? 'found' : 'not found yet';
    log(`todohighlight: watching for config at ${target} in ${folderPath} (${status})`);
}

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
 * Returns the workspace folder for a resource URI or file path.
 * @param {vscode.Uri|string|undefined} resource - Document URI or file path
 * @returns {vscode.WorkspaceFolder|undefined}
 */
function getWorkspaceFolder(resource) {
    if (!resource) {
        return workspace.workspaceFolders && workspace.workspaceFolders[0];
    }
    const uri = typeof resource === 'string' ? vscode.Uri.file(resource) : resource;
    let folder = workspace.getWorkspaceFolder(uri);

    if (!folder && uri.fsPath.endsWith('.code-workspace') && workspace.workspaceFolders) {
        const wsDir = path.normalize(path.dirname(uri.fsPath));
        folder = workspace.workspaceFolders.find((wf) => path.normalize(wf.uri.fsPath) === wsDir);
    }

    if (!folder && workspace.workspaceFolders) {
        const filePath = path.normalize(uri.fsPath);
        folder = workspace.workspaceFolders.find((wf) => {
            const root = path.normalize(wf.uri.fsPath);
            return filePath === root || filePath.startsWith(root + path.sep);
        });
    }

    return folder;
}

/**
 * Strips the `todohighlight.` prefix and keeps only known config keys.
 * @param {object} raw - Parsed config file contents
 * @returns {object|null} Normalized config or null if empty
 */
function normalizeFileConfig(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }

    const result = {};
    CONFIG_KEYS.forEach((key) => {
        if (raw[key] !== undefined) {
            result[key] = raw[key];
        }
        const prefixed = 'todohighlight.' + key;
        if (raw[prefixed] !== undefined) {
            result[key] = raw[prefixed];
        }
    });

    return Object.keys(result).length ? result : null;
}

/**
 * Resolves the path to a config file for a workspace folder.
 * @param {string} folderPath - Absolute workspace folder path
 * @param {string} configFileSetting - User-specified config file path, if any
 * @returns {string|null} Absolute path to the config file, or null if not found
 */
function resolveConfigPath(folderPath, configFileSetting) {
    if (configFileSetting && configFileSetting.trim()) {
        return path.isAbsolute(configFileSetting)
            ? configFileSetting
            : path.join(folderPath, configFileSetting);
    }

    for (let i = 0; i < CONFIG_FILE_NAMES.length; i++) {
        const candidate = path.join(folderPath, CONFIG_FILE_NAMES[i]);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

/**
 * Locates a workspace config file for a resource URI.
 * When configFile is set, searches all workspace roots (and the .code-workspace directory).
 * @param {vscode.Uri|string|undefined} resourceUri - Document URI for scoped lookup
 * @param {string} configFileSetting - User-specified config file path, if any
 * @returns {{ configPath: string|null, cacheKey: string }}
 */
function findConfigLocation(resourceUri, configFileSetting) {
    const customFile = configFileSetting && configFileSetting.trim();
    const searchDirs = [];

    if (workspace.workspaceFolders) {
        workspace.workspaceFolders.forEach((wf) => {
            if (!searchDirs.includes(wf.uri.fsPath)) {
                searchDirs.push(wf.uri.fsPath);
            }
        });
    }

    if (resourceUri) {
        const uri = typeof resourceUri === 'string' ? vscode.Uri.file(resourceUri) : resourceUri;
        if (uri.fsPath.endsWith('.code-workspace')) {
            const wsDir = path.dirname(uri.fsPath);
            if (!searchDirs.includes(wsDir)) {
                searchDirs.unshift(wsDir);
            }
        }
    }

    const folder = getWorkspaceFolder(resourceUri);
    if (folder && !searchDirs.includes(folder.uri.fsPath)) {
        searchDirs.unshift(folder.uri.fsPath);
    }

    if (customFile) {
        for (let i = 0; i < searchDirs.length; i++) {
            const configPath = resolveConfigPath(searchDirs[i], customFile);
            if (configPath && fs.existsSync(configPath)) {
                return { configPath, cacheKey: configPath };
            }
        }
        const probeDir = folder ? folder.uri.fsPath : searchDirs[0];
        const probePath = probeDir ? resolveConfigPath(probeDir, customFile) : null;
        return { configPath: null, cacheKey: probePath || '__none__' };
    }

    for (let i = 0; i < searchDirs.length; i++) {
        const configPath = resolveConfigPath(searchDirs[i], '');
        if (configPath && fs.existsSync(configPath)) {
            return { configPath, cacheKey: configPath };
        }
    }

    return { configPath: null, cacheKey: folder ? `__none__:${folder.uri.fsPath}` : '__none__' };
}

/**
 * Parses JSON or JSONC config file text.
 * @param {string} content - File contents
 * @param {string} filePath - Absolute path (for error messages)
 * @returns {object}
 */
function parseConfigContent(content, filePath) {
    const errors = [];
    const parsed = jsonc.parse(content, errors);

    if (errors.length) {
        const detail = jsonc.printParseErrorCode(errors[0].error);
        const location = errors[0].offset !== undefined ? ` at offset ${errors[0].offset}` : '';
        throw new SyntaxError(`${detail}${location} in ${filePath}`);
    }

    return parsed;
}

/**
 * Parses a config file from disk (JSON or JSONC).
 * @param {string} filePath - Absolute path to the config file
 * @returns {object|null} Normalized config
 */
function loadConfigFromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.js') {
        const requireFunc = typeof __webpack_require__ === 'function' ? __non_webpack_require__ : require;
        delete requireFunc.cache[requireFunc.resolve(filePath)];
        const mod = requireFunc(filePath);
        return normalizeFileConfig(mod.default || mod);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return normalizeFileConfig(parseConfigContent(content, filePath));
}

/**
 * Clears cached config file data for one config path or all entries.
 * @param {string} [cacheKey] - Config path or cache key, or omit to clear all
 */
function invalidateConfigCache(cacheKey) {
    if (cacheKey) {
        delete configFileCache[cacheKey];
        return;
    }

    Object.keys(configFileCache).forEach((key) => {
        delete configFileCache[key];
    });
}

/**
 * Merges VS Code settings with an optional workspace config file (file wins on conflict).
 * @param {vscode.Uri|undefined} resourceUri - Document URI for scoped settings
 * @returns {{get: function(string, *=): *, vscode: vscode.WorkspaceConfiguration, fileConfig: object|null, configPath: string|null}}
 */
function getEffectiveConfiguration(resourceUri) {
    const vscodeSettings = workspace.getConfiguration('todohighlight', resourceUri);
    const configFileSetting = vscodeSettings.get('configFile', '');
    const { configPath, cacheKey } = findConfigLocation(resourceUri, configFileSetting);
    let fileConfig = null;

    if (configPath) {
        const cached = configFileCache[cacheKey];
        if (cached) {
            fileConfig = cached.config;
        } else {
            try {
                fileConfig = loadConfigFromPath(configPath);
                configFileCache[cacheKey] = { path: configPath, config: fileConfig };
                log(`todohighlight: config loaded from ${configPath}`);
            } catch (err) {
                logError(`todohighlight: failed to load config file ${configPath}`, err);
                configFileCache[cacheKey] = { path: configPath, config: null };
            }
        }
    } else if (configFileCache[cacheKey]) {
        fileConfig = configFileCache[cacheKey].config;
    } else {
        configFileCache[cacheKey] = { path: null, config: null };
    }

    return {
        get(key, defaultValue) {
            if (fileConfig && fileConfig[key] !== undefined) {
                return fileConfig[key];
            }
            return vscodeSettings.get(key, defaultValue);
        },
        vscode: vscodeSettings,
        fileConfig: fileConfig,
        configPath: configPath
    };
}

/**
 * Registers file watchers so config file changes trigger a reload.
 * Returns a function to re-register watchers (e.g. after configFile setting changes).
 * @param {vscode.ExtensionContext} context - Extension context
 * @param {function(): void} onConfigChange - Called when a config file changes
 * @returns {function(): void} Call to refresh watchers for the current configFile setting
 */
function watchConfigFiles(context, onConfigChange) {
    let watchers = [];
    const AUTO_DETECT_GLOB = '{.todohighlight.json,.todohighlight.jsonc}';

    function refreshWatchers() {
        watchers.forEach((watcher) => watcher.dispose());
        watchers = [];

        if (!workspace.workspaceFolders) {
            return;
        }

        const watchedPaths = new Set();

        workspace.workspaceFolders.forEach((folder) => {
            const folderPath = folder.uri.fsPath;
            const vscodeSettings = workspace.getConfiguration('todohighlight', folder.uri);
            const configFileSetting = vscodeSettings.get('configFile', '');
            const customFile = configFileSetting && configFileSetting.trim();

            if (customFile) {
                const expectedPath = resolveConfigPath(folderPath, configFileSetting);
                if (!expectedPath || watchedPaths.has(expectedPath)) {
                    return;
                }
                watchedPaths.add(expectedPath);

                const ownerFolder = workspace.workspaceFolders.find((wf) => {
                    const root = wf.uri.fsPath;
                    return expectedPath === root || expectedPath.startsWith(root + path.sep);
                }) || folder;
                const pattern = new vscode.RelativePattern(ownerFolder, path.relative(ownerFolder.uri.fsPath, expectedPath));

                logConfigWatch({
                    folderPath,
                    target: expectedPath,
                    exists: fs.existsSync(expectedPath)
                });

                const watcher = workspace.createFileSystemWatcher(pattern);
                const reload = () => {
                    invalidateConfigCache(expectedPath);
                    onConfigChange();
                };

                watcher.onDidChange(reload);
                watcher.onDidCreate(reload);
                watcher.onDidDelete(reload);
                watchers.push(watcher);
                return;
            }

            logConfigWatch({
                folderPath,
                target: AUTO_DETECT_GLOB,
                exists: CONFIG_FILE_NAMES.some((name) => fs.existsSync(path.join(folderPath, name)))
            });

            const pattern = new vscode.RelativePattern(folder, AUTO_DETECT_GLOB);
            const watcher = workspace.createFileSystemWatcher(pattern);
            const reload = () => {
                invalidateConfigCache();
                onConfigChange();
            };

            watcher.onDidChange(reload);
            watcher.onDidCreate(reload);
            watcher.onDidDelete(reload);
            watchers.push(watcher);
        });
    }

    refreshWatchers();
    context.subscriptions.push({ dispose: () => watchers.forEach((watcher) => watcher.dispose()) });
    return refreshWatchers;
}

/**
 * Checks whether a file path matches include/exclude glob settings.
 * @param {vscode.Uri|string} resourceUri - Document URI or absolute file path
 * @param {{get: function(string, *=): *}|undefined} [settings] - Preloaded settings (avoids re-loading config)
 * @returns {boolean} True if the file should be processed
 */
function isFileNameOk(resourceUri, settings) {
    const filename = typeof resourceUri === 'string' ? resourceUri : resourceUri.fsPath;
    const effectiveSettings = settings || getEffectiveConfiguration(resourceUri);
    const includePatterns = getPaths(effectiveSettings.get('include')) || '{**/*}';
    const excludePatterns = getPaths(effectiveSettings.get('exclude'));

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
function searchAnnotations(workspaceState, pattern, callback, resourceUri) {
    const settings = getEffectiveConfiguration(resourceUri);
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
                endCol: locationInfo.endCol,
                matchedText: match[0]
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
        logError('todohighlight err:', err);
        setStatusMsg(defaultIcon, defaultMsg);
        return;
    }

    const resultNum = annotationList.length;
    const tooltip = resultNum + ' result(s) found';
    setStatusMsg(defaultIcon, resultNum, tooltip);
    showOutputChannel(annotationList);
}

/**
 * Strips keyword fields that are not valid DecorationRenderOptions for the output list.
 * Whole-line highlighting is disabled so only the keyword itself is coloured.
 * @param {object} keywordConfig - Merged keyword configuration
 * @returns {object} Style properties safe for createTextEditorDecorationType
 */
function outputStyleFromKeyword(keywordConfig) {
    const style = Object.assign({}, keywordConfig);
    delete style.text;
    delete style.wholeWord;
    delete style.regex;
    delete style.diagnosticSeverity;
    delete style.overviewRulerColor;
    delete style.overviewRulerLane;
    style.isWholeLine = false;
    return style;
}

/**
 * Whether a style has any visible colouring for the output list.
 * @param {object} style - DecorationRenderOptions-like object
 * @returns {boolean}
 */
function hasVisibleOutputStyle(style) {
    return !!(style && (style.color || style.backgroundColor || style.border || style.borderColor));
}

/**
 * Builds a keyword -> style map from the current effective settings.
 * @param {{get: function(string, *=): *}} settings - Effective configuration
 * @returns {{styleMap: object, isCaseSensitive: boolean, keywordsPattern: string}}
 */
function getOutputStyleContext(settings) {
    const isCaseSensitive = settings.get('isCaseSensitive', true);
    const keywordsPattern = settings.get('keywordsPattern') || '';
    const customDefaultStyle = settings.get('defaultStyle') || {};

    if (keywordsPattern.trim()) {
        return {
            styleMap: {
                '*': Object.assign({}, DEFAULT_STYLE, customDefaultStyle)
            },
            isCaseSensitive: isCaseSensitive,
            keywordsPattern: keywordsPattern
        };
    }

    return {
        styleMap: getAssembledData(settings.get('keywords'), customDefaultStyle, isCaseSensitive),
        isCaseSensitive: isCaseSensitive,
        keywordsPattern: ''
    };
}

/**
 * Resolves which style-map key applies to a matched annotation label.
 * @param {string} matchedText - Text matched by the search regex
 * @param {string} label - Full annotation label (starts at the match)
 * @param {object} styleMap - Keyword style map
 * @param {boolean} isCaseSensitive - Case-sensitivity setting
 * @param {string} keywordsPattern - keywordsPattern setting, if any
 * @returns {string|null} Key in styleMap, or null
 */
function resolveOutputStyleKey(matchedText, label, styleMap, isCaseSensitive, keywordsPattern) {
    if (keywordsPattern && keywordsPattern.trim()) {
        return '*';
    }

    const lookupExact = function (text) {
        if (!text) return null;
        if (styleMap[text]) return text;
        if (!isCaseSensitive) {
            const upper = text.toUpperCase();
            if (styleMap[upper]) return upper;
            return Object.keys(styleMap).find(function (k) {
                return k.toUpperCase() === upper;
            }) || null;
        }
        return null;
    };

    const exact = lookupExact(matchedText);
    if (exact) return exact;

    // Regex keywords: style key is `text`, but the match string may differ — use longest label prefix
    const keys = Object.keys(styleMap).sort(function (a, b) {
        return b.length - a.length;
    });
    const labelCmp = isCaseSensitive ? label : label.toUpperCase();
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const keyCmp = isCaseSensitive ? key : key.toUpperCase();
        if (labelCmp.startsWith(keyCmp)) {
            return key;
        }
    }

    return null;
}

/**
 * Infers matched keyword text from a label when it was not stored (older searches).
 * @param {string} label - Annotation label
 * @param {object} styleMap - Keyword style map
 * @param {boolean} isCaseSensitive - Case-sensitivity setting
 * @param {string} keywordsPattern - keywordsPattern setting, if any
 * @returns {string}
 */
function inferMatchedText(label, styleMap, isCaseSensitive, keywordsPattern) {
    if (!label) return '';
    if (keywordsPattern && keywordsPattern.trim()) {
        // Best effort: first whitespace-delimited token
        const token = label.match(/^\S+/);
        return token ? token[0] : label;
    }

    const keys = Object.keys(styleMap).sort(function (a, b) {
        return b.length - a.length;
    });
    const labelCmp = isCaseSensitive ? label : label.toUpperCase();
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const keyCmp = isCaseSensitive ? key : key.toUpperCase();
        if (labelCmp.startsWith(keyCmp)) {
            return label.substring(0, key.length);
        }
    }
    return '';
}

/**
 * Finds the visible text editor for the annotations output channel.
 * @returns {vscode.TextEditor|undefined}
 */
function findAnnotationsOutputEditor() {
    return window.visibleTextEditors.find(function (editor) {
        if (editor.document.uri.scheme !== 'output') {
            return false;
        }
        const haystack = editor.document.uri.toString() + ' ' + (editor.document.fileName || '');
        return haystack.indexOf(ANNOTATIONS_OUTPUT_CHANNEL_NAME) !== -1;
    });
}

/**
 * Disposes decoration types previously applied to the annotations output channel.
 */
function disposeOutputDecorations() {
    Object.keys(outputDecorationTypes).forEach(function (key) {
        outputDecorationTypes[key].dispose();
    });
    outputDecorationTypes = {};
}

/**
 * Counts annotation label lines in the output document (tab-prefixed, non-empty).
 * @param {vscode.TextDocument} doc - Output channel document
 * @returns {number}
 */
function countAnnotationLabelLines(doc) {
    let count = 0;
    for (let line = 0; line < doc.lineCount; line++) {
        const text = doc.lineAt(line).text;
        if (text.startsWith('\t') && text.length > 1) {
            count++;
        }
    }
    return count;
}

/**
 * Builds decoration ranges by scanning the visible output document for annotation labels.
 * Prefers live document positions over precomputed line numbers (output buffering can differ).
 * @param {vscode.TextEditor} editor - Annotations output editor
 * @param {object[]} data - Annotation list used to render the channel
 * @param {{styleMap: object, isCaseSensitive: boolean, keywordsPattern: string}} styleContext
 * @returns {object} Map of style key to vscode.Range[]
 */
function buildOutputRangesFromEditor(editor, data, styleContext) {
    const rangesByKey = {};
    const doc = editor.document;
    let annotationIndex = 0;

    for (let line = 0; line < doc.lineCount && annotationIndex < data.length; line++) {
        const text = doc.lineAt(line).text;
        if (!text.startsWith('\t') || text.length <= 1) {
            continue;
        }

        const v = data[annotationIndex];
        annotationIndex++;

        const label = text.substring(1);
        const matchedText = v.matchedText || inferMatchedText(
            label,
            styleContext.styleMap,
            styleContext.isCaseSensitive,
            styleContext.keywordsPattern
        );
        const styleKey = resolveOutputStyleKey(
            matchedText,
            label,
            styleContext.styleMap,
            styleContext.isCaseSensitive,
            styleContext.keywordsPattern
        );

        if (!matchedText || !styleKey || !styleContext.styleMap[styleKey]) {
            continue;
        }

        // Highlight the matched keyword where it appears on the label line
        const keywordStart = label.indexOf(matchedText);
        const startCol = 1 + (keywordStart >= 0 ? keywordStart : 0);
        const endCol = startCol + matchedText.length;
        if (!rangesByKey[styleKey]) {
            rangesByKey[styleKey] = [];
        }
        rangesByKey[styleKey].push(new vscode.Range(line, startCol, line, endCol));
    }

    return rangesByKey;
}

/**
 * Applies keyword colour decorations to the annotations output editor.
 * @param {object[]} data - Annotation list
 * @param {{styleMap: object, isCaseSensitive: boolean, keywordsPattern: string}} styleContext
 * @param {object} [fallbackRangesByKey] - Precomputed ranges if document scan finds nothing
 * @returns {boolean} True if decorations were applied (or the editor is ready with nothing to colour)
 */
function applyOutputChannelDecorations(data, styleContext, fallbackRangesByKey) {
    const editor = findAnnotationsOutputEditor();
    if (!editor) {
        return false;
    }

    const labelLineCount = countAnnotationLabelLines(editor.document);
    // Wait until output content has finished buffering into the editor document
    if (labelLineCount < data.length && editor.document.lineCount < data.length * LINES_PER_ANNOTATION) {
        return false;
    }

    disposeOutputDecorations();

    let rangesByKey = {};
    if (labelLineCount >= data.length) {
        rangesByKey = buildOutputRangesFromEditor(editor, data, styleContext);
    }
    if (!Object.keys(rangesByKey).length && fallbackRangesByKey) {
        rangesByKey = fallbackRangesByKey;
    }

    Object.keys(rangesByKey).forEach(function (key) {
        const keywordStyle = styleContext.styleMap[key];
        if (!keywordStyle) return;

        const renderOptions = outputStyleFromKeyword(keywordStyle);
        if (!hasVisibleOutputStyle(renderOptions)) {
            return;
        }

        outputDecorationTypes[key] = window.createTextEditorDecorationType(renderOptions);
        editor.setDecorations(outputDecorationTypes[key], rangesByKey[key]);
    });

    return true;
}

/**
 * Schedules decoration application, retrying briefly until the output editor is visible.
 * @param {object[]} data - Annotation list
 * @param {{styleMap: object, isCaseSensitive: boolean, keywordsPattern: string}} styleContext
 * @param {object} rangesByKey - Precomputed fallback ranges
 */
function scheduleOutputDecorations(data, styleContext, rangesByKey) {
    lastOutputDecorationState = {
        data: data,
        styleContext: styleContext,
        rangesByKey: rangesByKey
    };

    if (outputDecorationRetryTimer) {
        clearInterval(outputDecorationRetryTimer);
        outputDecorationRetryTimer = null;
    }

    const tryApply = function () {
        return applyOutputChannelDecorations(
            lastOutputDecorationState.data,
            lastOutputDecorationState.styleContext,
            lastOutputDecorationState.rangesByKey
        );
    };

    if (tryApply()) {
        return;
    }

    let attempts = 0;
    outputDecorationRetryTimer = setInterval(function () {
        attempts++;
        if (tryApply() || attempts >= 20) {
            clearInterval(outputDecorationRetryTimer);
            outputDecorationRetryTimer = null;
        }
    }, 50);
}

/**
 * Renders annotation search results in the output channel with clickable file links
 * and keyword colours matching the editor highlight styles (issue #98).
 * @param {object[]} data - Annotation objects with uri, label, lineNum, startCol
 */
function showOutputChannel(data) {
    if (!window.outputChannel) {
        window.outputChannel = window.createOutputChannel(ANNOTATIONS_OUTPUT_CHANNEL_NAME);
    }
    window.outputChannel.clear();
    disposeOutputDecorations();
    lastOutputDecorationState = null;

    if (data.length === 0) {
        window.showInformationMessage('No results. (Not included file types and individual files are not searched.)');
        return;
    }

    const activeUri = window.activeTextEditor && window.activeTextEditor.document.uri;
    const settings = getEffectiveConfiguration(activeUri);
    const toggleURI = settings.get('toggleURI', false);
    const platform = os.platform();
    const styleContext = getOutputStyleContext(settings);
    const rangesByKey = {};

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
        window.outputChannel.appendLine('\t' + v.label);
        window.outputChannel.appendLine('');

        const matchedText = v.matchedText || inferMatchedText(
            v.label,
            styleContext.styleMap,
            styleContext.isCaseSensitive,
            styleContext.keywordsPattern
        );
        const styleKey = resolveOutputStyleKey(
            matchedText,
            v.label,
            styleContext.styleMap,
            styleContext.isCaseSensitive,
            styleContext.keywordsPattern
        );

        if (matchedText && styleKey && styleContext.styleMap[styleKey]) {
            const labelLine = i * LINES_PER_ANNOTATION + 1;
            const startCol = 1; // after leading tab
            const endCol = startCol + matchedText.length;
            if (!rangesByKey[styleKey]) {
                rangesByKey[styleKey] = [];
            }
            rangesByKey[styleKey].push(new vscode.Range(labelLine, startCol, labelLine, endCol));
        }
    });
    window.outputChannel.show();
    scheduleOutputDecorations(data, styleContext, rangesByKey);
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
    logError('todohighlight err:', err);
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
    CONFIG_FILE_NAMES,
    DEFAULT_STYLE,
    annotationsFound,
    chooseAnnotationType,
    createStatusBarItem,
    escapeRegExp,
    escapeRegExpGroups,
    escapeRegExpGroupsLegacy,
    getAssembledData,
    getContent,
    getEffectiveConfiguration,
    initLogChannel,
    invalidateConfigCache,
    isFileNameOk,
    log,
    searchAnnotations,
    setStatusMsg,
    showLogChannel,
    showOutputChannel,
    watchConfigFiles,
    wholeWordPattern
};
