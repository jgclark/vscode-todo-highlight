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

Then check at https://marketplace.visualstudio.com/manage/publishers/jgclark, because it can have an error without it being clear on the CLI.

Notes:
- For me the Azure DevOps organization is `dev.azure.com/jgc-vsc` with login via GitHub `jgclark` account.
- Publisher name: jgclark
- Personal Access Token: see `HOWTO-publish.secrets` (local file; gitignored — create it next to this HOWTO if missing)
- but currently can't log in via command line (perhaps need MS login not GitHub?)...
- ... instead using [VSC Marketplace](https://marketplace.visualstudio.com/manage/publishers/jgclark?auth_redirect=True) instead. Use GitHub login.

## Renewing an expired Personal Access Token (PAT)

If `vsce publish` (or `vsce login`) fails because the PAT has expired, create a new one in Azure DevOps and update the local secrets file.

Official docs: [Publishing Extensions — Get a Personal Access Token](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token).

1. Open the Azure DevOps org: https://dev.azure.com/jgc-vsc (or any org under the same Microsoft account).
2. Open the **User settings** menu (next to your profile image) → **Personal access tokens**.
3. Optionally revoke or delete the old expired token.
4. Click **New Token** and set:
   - **Name**: e.g. `vsc-extensions-token` (or any label you like)
   - **Organization**: **All accessible organizations** (not a single org — `vsce` needs this)
   - **Expiration**: as long as you are comfortable with (max is typically 1 year)
   - **Scopes**: **Custom defined** → click **Show all scopes** → under **Marketplace** tick **Manage**
5. Click **Create**, then **copy the token immediately** (it is shown only once).
6. Store it in `HOWTO-publish.secrets` (gitignored), replacing the old value.
7. Re-authenticate vsce and publish:
   ```
   vsce login jgclark
   ```
   Paste the new PAT when prompted, then:
   ```
   vsce publish [version number]
   ```
   Or pass the token once: `vsce publish -p <token>`

Common mistakes that produce 401/403:
- Organization set to a specific org instead of **All accessible organizations**
- Marketplace scope not set to **Manage**
