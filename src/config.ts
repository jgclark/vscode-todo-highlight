import { DecorationRenderOptions } from 'vscode';
import { VSCodeConfigurations } from './config-utils';


export interface TextKeyword extends DecorationRenderOptions {
    /**
     * Custom text to be highlighted.
     */
    text: string;
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
}


const EXTENSION = 'todohighlight';
export const configurations = new VSCodeConfigurations<TODOHighlightConfig>(EXTENSION);
