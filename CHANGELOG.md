# Change Log
To update to the latest version, please use VSCode's own Extensions user interface.

## 2.2.1 - 2026-09-18
- security: bump `fast-uri` override to 3.1.6 (Dependabot #85 / CVE-2026-76172).
- security: bump `js-yaml` override to 4.3.2 (Dependabot #80 / GHSA-5p4m-2wfm-xmqj and #87 / CVE-2026-84375).

## 2.2.0 - 2026-06-30
- added workspace config file support (issue #89). Place `todohighlight.json` in the workspace root, or set `todohighlight.configFile` to a custom path. Config file values override the same keys in VS Code `settings.json`; both sources remain available. Config files are watched and reloaded automatically.
- fix: config watch logs now say `(found)` or `(not found yet)` instead of implying a missing file already exists; configured paths are watched even before the file is created.
- fix: `.jsonc` config files (and `.json` files with comments/trailing commas) are now parsed correctly instead of failing with a JSON syntax error.
- fix: stop spamming the config log on every editor change; reuse loaded settings for include/exclude checks.
- fix: multi-root workspaces and `.code-workspace` files now resolve `todohighlight.configFile` by searching all workspace roots.

## 2.1.0 - 2026-06-30
- security: pin `brace-expansion` overrides to patched 1.1.16 / 2.1.3 / 5.0.8 (Dependabot #67 and related CVE-2026-13149 / CVE-2026-14257 alerts).
- security: pin `fast-uri` override to 3.1.4 (Dependabot #70 / CVE-2026-16221).
- security: linkify-it / markdown-it / xml2js Dependabot alerts #66, #68, #64, #12 addressed by removal of `vsce` (and its transitive deps) from dependencies - no longer in the lockfile.
- security: pin `js-yaml` override to 4.3.0 (Dependabot #73 / CVE-2026-59869).
- security: pin `serialize-javascript` override to 7.0.7 (Dependabot #50 / GHSA-5c6j-r48x-rmvq and #61 / CVE-2026-34043).
Fix issues identified by @Cursor, including:
- multi-root scopes not supported
- sometimes further matches on a line after the first were ignored
- reset before each decoration scan so highlights update reliably on re-runs
<!-- - getAssembledData: regex.push(v.regex.pattern || text) and if (regex.length) so default keyword merging works correctly
- searchAnnotations: findFiles errors now call callback(err) so the search does not hang
- window.processing: set to false when search completes or on error (was incorrectly true)
- searchAnnotationInFile: uses file.uri.fsPath instead of substring(7); finds all matches per line via a global regex loop
- getContent / getLocationInfo: use match.index; getLocationInfo uses workspace.asRelativePath() instead of deprecated workspace.rootPath
- Activation: activeTextEditor?.document so the extension loads when no editor is open
- Config reload: onDidChangeConfiguration uses activeEditor?.document?.uri for multi-root scope
- Excluded files: clears decorations and diagnostics when isFileNameOk returns false
- decorationStyleFromKeyword: strips text, wholeWord, regex, diagnosticSeverity before creating decoration types
- Regex flags: built once with 'g' or 'gi' instead of double new RegExp
- pattern.lastIndex = 0: reset before each decoration scan so highlights update reliably on re-runs -->

## 2.0.9 - 2026-06-30
- added whole-word matching (issue #104). Set the new `todohighlight.wholeWordMatch` setting to `true` to only highlight plain-text keywords when they appear as whole words (e.g. so `BUG:` no longer matches the `BUG:` inside `DEBUG:`). It can also be controlled per keyword via the new `wholeWord` property, which overrides the global setting. Keywords that use a custom `regex` are not affected.
- dev: move some `dependencies` to `devDependencies`, and add `minimatch` as a formal dependency
- dev: added jsdoc comments

## 2.0.8 - 2023-04-12
- an interim release that bundles up existing merged PRs, mostly from security updates in dependencies. Including
  - Include and exclude options (issue #42, thanks to PR #66 by @yuriykis)
- took several interim uploads before I got the right updated badge format.

## 2.0.5 - 2021-09-07
- added some missing auto-completions when working in VSCode's JSON settings

## 2.0.4 - 2021-09-04
- no feature changes, but improved documentation, thanks to various recent questions and suggestions via GitHub issues.

## 2.0.3 - 2021-07-09
- no feature changes, but updated dependencies to remove security vulnerabilities (thanks to dependabot).

## 2.0.2 - 2021-05-12
- no feature changes, but updated dependencies to remove security vulnerabilities (thanks to dependabot).

## 2.0.1 - 2021-02-07
- no feature changes, but found a way to include the `exclude` and `include` settings in the settings UI, not just the JSON version.

## 2.0.0 - 2021-01-27
- no feature changes, but now renamed to v2 to make it clearer in the VSCode Extension Marketplace. Thanks to Sebastian Werner for the suggestion, which I probably should have done as soon as I took it over.

## 1.2.5 - 2021-01-26
- add `isWholeLine` to definition of `defaultStyle` in configuration (thanks to @ctf0 for reporting)

## 1.2.4 - 2021-01-21
- hopefully a fix to allow file links in the Output area to work on Mac (thanks to @Zerefdev)

## 1.2.3 - 2021-01-19
- moved the history note to the top of the README to help others see why this is different than the similarly-named, but now abandoned, original extension. (Thanks to Sebastian Werner.)

## 1.2.3 - 2020-09-19
- improve documentation, including the worked example so that TODO (without the colon) and FIXME work out of the gate. (issue 8)
- updated exported configuration to allow per-language `keyword` settings

## 1.2.2 - 2020-07-31
- updated regex in NOTE: example in the README (issue 3)

## 1.2.1 - 2020-07-11
- added more filetypes to be included by default: .txt, .md, .mmd, .mdown, .markdown, .rb, .go

## 1.2.0 - 2020-07-08
First release by @jgclark forked from @wayou's original.

Includes fixes and PRs from [previous repo](https://github.com/wayou/vscode-todo-highlight):
- add Regex ability by merging (PR #152 by vonEdfa, issue #144 is similar)
- add ability to change whole line colour (issue #176)
- fixed typos #168
- added `extensionKind` attribute to facilitate remote development (issues #149, #166)
- added note about disabling background colour (documentation issue #174)
- added note about overriding include/exclude lists (documentation issue #140)
- added note about other CSS that can be used (from issue #172)


## 1.0.4
- last release by wayou

## various other releases

## 0.5.12 - 2018-03-16
- merge #77
- update doc for the refer for DecorationRenderOptions

## 0.5.11 - 2017-09-02
- fix style for the doc on vscode market

## 0.5.9 - 2017-08-30
- using array for include/exclude configuration, resolve #56. for backward compatability, string is also valid
- register disposable items to the context
- merge PR #58 exclude `.next` directory while searching for annotations as default
- exclude `.github` directory while searching for annotations as default

## 0.5.8 - 2017-07-19
- revert the fix for #48, the `\b` pattern cause other issues #51,#52

## 0.5.7 - 2017-07-18
- typo fix, resolve #47
- fix #48, the unwanted partial highlight

## 0.5.6 - 2017-07-17
- fix typo within the doc and minor fix for a potential bug. see #46

## 0.5.5 - 2017-06-01
- update doc. fix typo of the example configuration within the README file.
- fix a bug that the `defaultStyle` not applied to built in keywords `TODO:` and `FIXME:`

## 0.5.4 - 2017-05-31
- remove `todohighlight.highlightWholeLine` from configuration contributes.
- update doc, add reference to the official API for a full list of available styling properties, resolve #40

## 0.5.2 - 2017-05-19
- minor fix: clear highlight when keywords are been edited and no longer exists

## 0.5.1 - 2017-05-18
- minor fix: escase regexp for the keywords text property so that we can highlght `.$|\`, etc. resolve #36, resolve #37

## 0.5.0 - 2017-05-17
- support keywords configuration via RegExp by tuning the `todohighlight.keywordsPattern`. if the regexp is provided, the `todohighlight.keywords` will be ignored, resolve #28, resolve #33, resolve #36

## 0.4.16 - 2017-04-24
- there always been users report that the file path not clickable in the output channel. provide an option `todoghighlight.toggleURI` to toggle the file pattern. resolve #31

## 0.4.15 - 2017-04-08
- auto detect platform using the `os` module, thx @anupam-git for PR#26

## 0.4.14 - 2017-04-02
- clear output channel if no results, fix #24

## 0.4.10 - 2017-03-21
- show progress indicator for file searching
- add a configuration key `maxFilesForSearch` to set the max files that allowed to search, default is 5120

## 0.4.9 - 2017-03-20
- add `**/build/**` and `**/.vscode/**` into default exclude directories

## 0.4.7 - 2017-03-18
- fix #20, the file path that not clickable on Linux. provide a configuratoin to toggle the pattern of the file path, this way can ensure the file path clickable on both UNIX and Windows

## 0.4.6 - 2017-03-17
- glob pattern copied from [vscode api doc](https://code.visualstudio.com/docs/extensionAPI/vscode-api) using the `∕`(divition slash, witch is different from `/`) for path portion, this makes the exclude pattern fail to work in code. fix #14
- file pattern `<path>#<line>` seems clickable within the output channel on Mac now. remove the `<path>:<line>:<col>` form the output channel and resolve #19
- reduce the max allowed size for `findFiles` from 5120 to 999 for performance consideration

## 0.4.5 - 2017-03-02
- entire line highlighting support via configuration, resolve #16

## 0.4.4 - 2017-03-02
- seems no workaround for the links within the outputpannel to work on both mac and windows, so display the two type of links

## 0.4.3 - 2017-03-02
- just find that links in the outputchannel not clickable on Mac now, using hash and will work both on Windows and Mac now. 

## 0.4.2 - 2017-03-01
- fix #15 links in outputh channel not clickable on windows

## 0.4.1 - 2017-03-01
- list annotations into the outputchannel instead of the quickpick panel, resolve #13
- store search result into workspaceState, using the status bar item to show the result at any time

## 0.4.0 - 2017-02-23
- list annotations, resolve #7,#9
- show corresponding message in status bar, resolve #12

## 0.3.0 - 2017-01-14
- using `onDidChangeConfiguration` API to detect configuration change and make the user settings take effect
- adding command `Toggle highlight` to enable/disable the highlight
- adding a configuration section `todohighlight.isEnable` to enable/disable the highlight

## 0.2.1 - 2017-01-06
- fix #5

## 0.2.0 - 2017-01-06
- ruler color customizing support, see also #4
- make user settings take effect immediately without editor reload

## 0.1.0 - 2017-01-05
- resolve #2, customizing colors support
- resolve #3, customizing keywords support
- case sensitive config now support in settings, see also #1
- add MIT license

## 0.0.5 - 2016-12-27
- enable case-insensitive patterns , see #1

## 0.0.1 - 2016-12-22
- initial release
