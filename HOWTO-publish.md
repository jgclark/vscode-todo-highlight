# HOWTO publish this extensions
Building on VSCode instructions to [build, package](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) and [publish](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publishing-extensions) extensions.

Pre-requisites:
```
brew install node
cd [code directory for extension]
npm install --save-dev webpack webpack-cli
npm install -g vsce   [surprisingly difficult to get this to work -- can't understand where it puts things]
```

Write / configure these files:
- wepback.config.js
- .vscodeignore

Update version number in
- package.json
- package-lock.json

Then if all goes well, all that's needed to create a local `.vsix` package for testing or distribution is:
```
npm run webpack
vsce package
```

To test this `.vsix` package at this stage:
1. go to the Extensions pane, and in the top right corner under the '...' menu there's an option to "Install from VSIX ..." and point it to the new `.vsix` package.
2. re-load VSC to active the new extension.
3. test it.
To revert back to the marketplace version, right-click on the extension and select "Install Another Version ..." which appears to give a list of your previously-installed versions from the marketplace.

To test for web version of VSC use https://github.com/microsoft/vscode-test-web:

```
npx vscode-test-web --browserType=webkit --extensionDevelopmentPath=. .
```

Publishing to the actual VSC Marketplace requires an ['Azure organisation'](https://docs.microsoft.com/en-gb/azure/devops/organizations/accounts/create-organization?view=azure-devops), and a Personal Access Token.  And then some configuration:
```
vsce login [publisher name]
vsce publish [version number]
```

Notes:
- For me the Azure DevOps organization is `dev.azure.com/jgc-vsc' linked to `jgclark` GitHub.
- Publisher name: jgclark
- Personal Access Token: see `HOWTO-publish.secrets` (local file; gitignored — create it next to this HOWTO if missing)
- but currently can't log in via command line (perhaps need MS login not GitHub?)...
- ... instead using [VSC Marketplace](https://marketplace.visualstudio.com/manage/publishers/jgclark?auth_redirect=True) instead. Use GitHub login.
