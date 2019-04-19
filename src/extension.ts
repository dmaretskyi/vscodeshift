import * as vscode from "vscode";
import * as jscodeshift from "jscodeshift";
import { readdir } from "fs";
import { join } from "path";
import { promisify } from "util";

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "extension.codemod",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const source = editor.document.getText();
        try {
          const codemods = await enumerateCodemods();
          if (codemods.length === 0) {
            return;
          }
          const selection = await showSelectionMenu(codemods);
          if (!selection) {
            return;
          }
          const codemodPath = join(
            vscode.workspace.rootPath!,
            "codemods",
            selection
          );
          const res = await execCodemod(codemodPath, {
            source,
            path: editor.document.fileName
          });

          if (res) {
            await replaceBuffer(res);
          }
        } catch (err) {
          vscode.window.showErrorMessage(err.message);
        }
      }
    }
  );

  context.subscriptions.push(disposable);
}

async function replaceBuffer(res: string) {
  const editor = vscode.window.activeTextEditor!;
  await editor.edit(builder => {
    builder.replace(
      new vscode.Range(
        new vscode.Position(0, 0),
        editor.document.lineAt(editor.document.lineCount - 1).range.end
      ),
      res
    );
  });
}

export function deactivate() {}

async function enumerateCodemods() {
  if (!vscode.workspace.rootPath) {
    return [];
  }
  try {
    const files = await promisify(readdir)(
      join(vscode.workspace.rootPath, "codemods")
    );
    return files;
  } catch (err) {
    vscode.window.showErrorMessage(
      `Could not enumerate codemods:\n${err.message}`
    );
    return [];
  }
}

async function execCodemod(
  path: string,
  fileInfo: jscodeshift.FileInfo
): Promise<string | null> {
  const withParser = jscodeshift.withParser("tsx");
  const transformer = require(path);

  try {
    return transformer(fileInfo, {
      jscodeshift: withParser,
      j: withParser
    });
  } catch (err) {
    vscode.window.showErrorMessage(`Transform error:\n${err.message}`);
    return null;
  }
}

async function showSelectionMenu(codemods: string[]) {
  return vscode.window.showQuickPick(codemods);
}
