## TODO Highlight v2

[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg)](https://opensource.org/licenses/MIT) [![Version](https://vsmarketplacebadges.dev/version-short/jgclark.vscode-todo-highlight.png)](https://marketplace.visualstudio.com/items?itemName=jgclark.vscode-todo-highlight) [![Installs](https://vsmarketplacebadges.dev/installs-short/jgclark.vscode-todo-highlight.png)](https://marketplace.visualstudio.com/items?itemName=jgclark.vscode-todo-highlight) [![Ratings](https://vsmarketplacebadges.dev/rating-star/jgclark.vscode-todo-highlight.png)](https://marketplace.visualstudio.com/items?itemName=jgclark.vscode-todo-highlight)

**Highlight `TODO:`, `FIXME:` and any other annotations you wish within your code in VSCode.**

Sometimes you forget to review the TODOs and NOTEs you've added while coding before you publish the code to production. This extension highlights them, making them harder to forget. They're shown in the file, in the output channel, and optionally as decorations in the 'overview ruler' too.

They can also be set on a per-language basis.

> NB: This extension was [started and maintained by **wayou**](https://github.com/wayou/vscode-todo-highlight) until 2018, when it appears to have been abandoned.
> I, ([**jgclark**](https://github.com/jgclark)) then picked it up in mid-2020, using the [significant PR from **vonEdfa** to add regexes](https://github.com/wayou/vscode-todo-highlight/pull/152), and also dealt with some other issues in the original repository. See CHANGELOG.md for more details. However, I'm not really a JavaScript programmer, so I welcome PRs from others to help improve it further. Thanks!

### Preview
- with `material night` color theme:
![](https://github.com/wayou/vscode-todo-highlight/raw/master/assets/material-night.png)

- with `material night eighties` color theme:
![](https://github.com/wayou/vscode-todo-highlight/raw/master/assets/material-night-eighties.png)

### Commands
This extension contributes the following commands to the Command palette.

- `Toggle highlight` : turn on/off the highlight
![](https://github.com/wayou/vscode-todo-highlight/raw/master/assets/toggle-highlight.gif)
- `List highlighted annotations` : list annotations to the Output tab (when you have a folder and/or workspace open; when you are working on individual files in one or more editors, the command returns 0 results).
![](https://github.com/wayou/vscode-todo-highlight/raw/master/assets/list-annotations.gif)

### Installing
You can install the latest version of the [extension from the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=jgclark.vscode-todo-highlight).

The [source code is available on GitHub](https://github.com/jgclark/vscode-todo-highlight).
 
### Configuration
`TODO:` and `FIXME:` are built-in keywords. You can override the look by customizing the settings.

To customize the keywords and other settings, <kbd>command</kbd> + <kbd>,</kbd> (or on Windows / Linux: File -> Preferences -> User Settings) to open the VSCode file `settings.json`.

| Setting                        | Type    | Default | Description                                                                                                                                                                                                                                                           |
| ------------------------------- | ------- | --------| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| todohighlight.isEnable          | boolean | true    | Toggle the highlight, default is true.                                                                                                                                                                                                                                |
| todohighlight.enableDiagnostics | boolean | true    | Enable creating diagnostic entries for open files in the problems view. Default is false.                                                                                                                                                                             |
| todohighlight.isCaseSensitive   | boolean | true    | Whether the keywords are case sensitive or not.                                                                                                                                                                                                                       |
| todohighlight.keywords          | array   | N/A     | An array of keywords that will be highlighted. You can also specify the style for each keyword here, and a more advanced regex to detect the item to highlight. See example below for more information.                                                               |
| todohighlight.keywordsPattern   | string  | N/A     | Specify keywords via regex instead of `todohighlight.keywords` one by one. NB: if this is present, `todohighlight.keywords` will be ignored. Remember to escape the backslash if there's any in your regex (using \\ (double backslash) instead of single backslash). |
| todohighlight.defaultStyle      | object  | N/A     | Specify the default style for custom keywords, if not specified, build in default style will be applied. [See all available properties on VSCode doc DecorationRenderOptions section](https://code.visualstudio.com/docs/extensionAPI/vscode-api)                     |
| todohighlight.maxFilesForSearch | number  | 5120    | Max files for searching, mostly you don't need to configure this.                                                                                                                                                                                                     |
| todohighlight.toggleURI         | boolean | false   | If the file path within the output channel is not clickable, set this to true to toggle the path pattern between `<path>#<line>` and `<path>:<line>:<column>`.                                                                                                        |
| todohighlight.includedLanguages  | array   | []                                                                | Optional list of language ids where highlighting will be turned on. If empty, then all open files will be highlighted. (E.g. `["typescript", "go"]`.) |
| todohighlight.excludedFiles           | array   | [<br>`"**/node_modules/**"`,<br>`"**/dist/**",`<br>`"**/bower_components/**"`,<br>`"**/build/**",`<br>`"**/.vscode/**"`,<br>`"**/.github/**"`,<br>`"**/_output/**"`,<br>`"**/*.min.*"`,<br>`"**/*.map"`<br>] | Glob pattern that defines files and folders where highlighting will not be turned on.<br> **Note:** Explicitly specifying `excludedFiles` patterns will override the default settings, so if you want to add new patterns, and also use the defaults, you will need to include the default patterns as well. The better way to accomplish this is to open Settings (UI) and "Add Item" in these fields from there at least once, before changing in Settings (JSON).  |

An example of a custom configuration, showing a range of the different features:

```jsonc
{
    "todohighlight.isEnable": true,
    "todohighlight.isCaseSensitive": true,
    "todohighlight.keywords": [
        "FIXME:", // without further details, this will use the defaultStyle
        "REVIEW:", // as will this
        // now for a more complex example
        {
            "text": "INFO:", // without a defined regex pattern this is the string that will be matched
            "color": "green",
            "backgroundColor": "rgba(0,0,0,0)", // INFO: setting the last parameter to zero (alpha channel) disables the background colour
            "border": "none",
            "isWholeLine": false
        },
        {
            "text": "WARNING:", 
            "before": {
                "contentText": "⚠️" // adds text before the highlight
            }, 
            "after": {
                "contentText": "⚠️" // adds text after the highlight
            },
            "color": "red",
            "border": "1px solid red",
            "borderRadius": "2px", // NOTE: use borderRadius along with `border` or you will see nothing change
            "backgroundColor": "rgba(0,0,0,.2)",
            "diagnosticSeverity": "warning" // Set diagnostic severity to `none`, `information`, `warning` or `error`
        },
        {
            "text": "TODO(string):", // with a regex pattern defined, this setting isn't used, but is useful as a name for this section
            "regex": {
                "pattern": "(?<=^|\"|\\s)TODO(\\(\\w+\\))?:" // this allows for TODO: or TODO(Bob): etc.
            },
            "color": "red",
            "border": "1px solid red",
            "borderRadius": "2px", //NOTE: use borderRadius along with `border` or you will see nothing change
            "backgroundColor": "rgba(0,0,0,.2)"
        },
        {
            "text": "NOTE:", // with a regex pattern defined, this setting isn't used, but is useful as a name for this section
            "color": "#ff0000",
            "backgroundColor": "yellow",
            "overviewRulerColor": "grey",
            "regex": {
                "pattern": "(?<=^|\"|\\s)NOTE[:]?(?!\\w)" // in this example, highlight `NOTE:` with or without the `:` and that's not part of another word.  (I.e.: The above will highlight 'NOTE' but not the "note" in 'SIDENOTE').
                /**
                 * Positive lookbehind (`(?<=...)`) is only supported in Node.js v9 and up.
                 * If your VSCode version is built on an earlier version the example above may not work. Simple tests:
                        * Shouldn't work: note  deNOTEd  NOTEing
                        * Should work: NOTE:  "NOTE:"
                 **/
            },
            "isWholeLine": false
        },
    ],
    "todohighlight.keywordsPattern": "TODO:|FIXME:|\\(([^\\)]+)\\)", //highlight `TODO:`,`FIXME:` or content between parentheses
    // NOTE: remember to escape the backslash if there's any in your regexp (using \\\\ instead of single backslash)"
    "todohighlight.defaultStyle": {
        "color": "red",
        "backgroundColor": "#ffab00",
        "overviewRulerColor": "#ffab00",
        "cursor": "pointer",
        "border": "1px solid #eee",
        "borderRadius": "2px",
        "isWholeLine": false,
        //other styling properties goes here ... 
    },
    "todohighlight.includedLanguages": [ 
    ],
    "todohighlight.excludedFiles": [
        "**/node_modules/**",
        "**/bower_components/**",
        "**/dist/**",
        "**/build/**",
        "**/.vscode/**",
        "**/.vscode-test/**",
        "**/.github/**",
        "**/_output/**",
        "**/*.min.*",
        "**/*.map",
        "**/.next/**"
    ],
    "todohighlight.maxFilesForSearch": 5120,
    "todohighlight.toggleURI": false
}
```
NB: The `keywords` setting can be overridden in per-language configuration settings. In this example, an additional  keyword is added for markdown files:
```jsonc
    "[markdown]": {
        "todohighlight.keywords": [
            {
                "text": "BRACKETS:",
                "color": "#000000",
                "backgroundColor": "pink",
                "regex": { 
                    "pattern": "(?<=\\{)[^\\}\\n]+(?=\\})" // highlight things in {ss} but not including line breaks
                }
            }
        ]
    }
```

### Theme Colors
You can find a full list of theme colors here: https://code.visualstudio.com/api/references/theme-color

### CSS tips
This extension uses CSS that deals with color, borders, spacing etc. It is defined in [this VSCode documentation](https://code.visualstudio.com/api/references/vscode-api#DecorationRenderOptions)).  Note that this is not the exactly same as CSS.

For example, the following possibilities may not be so obvious:
- `"backgroundColor": "rgba(0,0,0,0)"` // setting the last parameter to zero (alpha channel) disables the background color
- or you can use `"backgroundColor": "editor.background"` to use the current editor's background color
- use `"before": { "contentText": "⚠️" }` to add text before the highlight

### History
This extension was [started and maintained by **wayou**](https://github.com/wayou/vscode-todo-highlight) until 2018. [**jgclark**](https://github.com/jgclark) then picked it up in mid-2020, using [significant PR #152 from **vonEdfa**](https://github.com/wayou/vscode-todo-highlight/pull/152), and dealt with some other issues in the original repository. See CHANGELOG.md for more details.
