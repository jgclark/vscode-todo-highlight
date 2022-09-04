const vscode = require('vscode');
const util = require('./util');

function styleContextKey(id) {
    return `todohighlight.styleContextKey${id}`;
}

function applyStyleCommand(id) {
    return `todohighlight.applyStyle${id}`;
}

function getSelectionOrWord(editor) {
    return editor.selection.isEmpty
        ? editor.document.getText(
              editor.document.getWordRangeAtPosition(editor.selection.start)
          )
        : editor.document.getText(editor.selection);
}

const disposables = [];

function init(settings) {
    // first, clean up all registered commands
    disposables.forEach((d) => d.dispose());
    disposables.length = 0;

    const styles = settings.get('styles');
    for (const style of styles) {
        vscode.commands.executeCommand(
            'setContext',
            styleContextKey(style.id),
            style.enabled === true
        );

        disposables.push(
            vscode.commands.registerTextEditorCommand(
                applyStyleCommand(style.id),
                // get selection
                async (editor, _) => {
                    const text = getSelectionOrWord(editor);
                    // add corresponding highlight entry to workspace setting
                    const newStyleObject = {
                        styleId: style.id,
                        text: text,
                    };

                    const currentSettings = settings.get('keywords');
                    const idx = currentSettings.findIndex(
                        (item) => item.text === text
                    );
                    if (idx !== -1) {
                        currentSettings[idx] = newStyleObject;
                    } else {
                        currentSettings.push(newStyleObject);
                    }

                    settings.update('keywords', currentSettings);
                }
            )
        );
    }
}

function clearStyle(editor, settings) {
    const currentSettings = settings.get('keywords');
    const text = getSelectionOrWord(editor);
    const idx = currentSettings.findIndex(
        (item) => util.isReferencedStyleKeyword(item) && item.text === text
    );
    if (idx !== -1) {
        currentSettings.splice(idx, 1);
    }
    settings.update('keywords', currentSettings);
}

module.exports = {
    init,
    clearStyle,
    disposables,
};
