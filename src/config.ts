import * as vscode from 'vscode';
import { ConfigurationTarget, DecorationRenderOptions, workspace, WorkspaceConfiguration } from 'vscode';

export const SeverityMap = {
    'error': vscode.DiagnosticSeverity.Error,
    'warning': vscode.DiagnosticSeverity.Warning,
    'information': vscode.DiagnosticSeverity.Information,
    'none': undefined,
};


export interface TextKeyword extends DecorationRenderOptions {
    /**
     * Custom text to be highlighted.
     */
    text: string;
    /**
     * Custom severity of the highlight.
     */ 
    diagnosticSeverity?: keyof typeof SeverityMap;
}
export interface RegExpKeyword extends DecorationRenderOptions {
    /**
     * name of the regexp keyword.
     */
    text: string;
    regex: {
        /**
         * The RegEx pattern to use for matching instead of the text value. REMEMBER to escape any backslashes in your regexp (using \\ instead of single backslash).
         */
        pattern: string;
    };
    /**
     * Custom severity of the highlight.
     */ 
    diagnosticSeverity?: keyof typeof SeverityMap;
}

export type Keyword = TextKeyword | RegExpKeyword;

export interface TODOHighlightConfig {
    /**
     * Enable or disable the highlighting
     */
    isEnable: boolean;
    /**
     * Specify whether the keywords are case sensitive or not
     */
    isCaseSensitive: boolean;
    /**
     * If the file path within the output channel is not clickable, set this to true to toggle the path patten between `<path>#<line>` and `<path>:<line>:<column>`
     */
    toggleURI: boolean;
    /*
     * An array of keywords, and their CSS to customise how they look. See all available properties in the [VSCode doc on DecorationRenderOptions](https://code.visualstudio.com/api/references/vscode-api#DecorationRenderOptions) section.
    */
    keywords: (string | Keyword)[];
    /**
     * Specify keywords via RegExp instead of `todohighlight.keywords` one by one. NOTE that if this present, `todohighlight.keywords` will be ignored. REMEMBER to escapse any backslashes in your regexp (using \\ instead of single backslash).
     */
    keywordsPattern: string;
    /**
     * Default style for all customized keywords. See all available properties in the [VSCode doc on DecorationRenderOptions](https://code.visualstudio.com/api/references/vscode-api#DecorationRenderOptions) section.
     */
    defaultStyle: DecorationRenderOptions;
    /**
     * Glob patterns that defines the files to search for. Only include files you need, DO NOT USE `{** /*.*}` for both performance and to avoid binary files.
     */
    include: string[];
    /**
     * Glob pattern that defines files and folders to exclude while listing annotations.
     */
    exclude: string[];
    /**
     * Max files for searching
     */
    maxFilesForSearch: number;
    /**
     * Enable creating entries in the problems view.
     */
    enableDiagnostics: boolean;
}

export class TODOHighlightConfiguration {
    readonly section = 'todohighlight';
    get config(): WorkspaceConfiguration {
        return workspace.getConfiguration(this.section);
    }

    update<K extends keyof TODOHighlightConfig>(
        subsection: K,
        value: TODOHighlightConfig[K],
        configurationTarget?: boolean | ConfigurationTarget,
        overrideInLanguage?: boolean
    ): Thenable<void> {
        return this.config.update(subsection, value, configurationTarget, overrideInLanguage);
    }

    get<K extends keyof TODOHighlightConfig>(
        subsection: K,
    ): TODOHighlightConfig[K] | undefined;
    get<K extends keyof TODOHighlightConfig>(
        subsection: K,
        defaultValue: TODOHighlightConfig[K],
    ): TODOHighlightConfig[K];
    get(subsection: any, defaultValue?: any) {
        return this.config.get(subsection, defaultValue);
    }
}

export const configurations = new TODOHighlightConfiguration();
