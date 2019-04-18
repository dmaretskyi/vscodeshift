import * as vscode from "vscode";
import * as jscodeshift from "jscodeshift";

function testTransform(fileInfo: jscodeshift.FileInfo, { j }: jscodeshift.API) {
  const root = j(fileInfo.source);

  root.find(j.Identifier).replaceWith(p =>
    j.identifier(
      p.value.name
        .split("")
        .reverse()
        .join("")
    )
  );
  return root.toSource();
}

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand("extension.codemod", () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const source = editor.document.getText();
      try {
        const res = testTransform(
          {
            source,
            path: editor.document.fileName
          },
          {
            jscodeshift,
            j: jscodeshift
          } as any
        );
        editor.edit(builder => {
          builder.replace(new vscode.Position(0, 0), res);
        });
      } catch (err) {
        console.error(err);
      }
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
