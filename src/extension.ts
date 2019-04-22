import * as vscode from "vscode";
import * as jscodeshift from "jscodeshift";
import { readdir } from "fs";
import { join, dirname } from "path";
import { promisify } from "util";
import { register } from "ts-node";

export function activate(context: vscode.ExtensionContext) {
  register({
    compilerOptions: {
      allowJs: true,
      resolveJsonModule: true,
      esModuleInterop: true,
      target: "es2015",
      lib: ["esnext", "dom"],
      skipLibCheck: true
    }
  });

  let disposable = vscode.commands.registerCommand(
    "extension.codemod",
    async () => {
      console.log("Starting codemod command");
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        console.warn("no active editor");
        return;
      }
      try {
        const source = editor.document.getText();
        const codemods = await enumerateCodemods();
        if (codemods.length === 0) {
          vscode.window.showInformationMessage("No codemods were found");
          return;
        }
        const selection = await showSelectionMenu(codemods);
        if (!selection || selection.length === 0) {
          vscode.window.showInformationMessage("No selection");
          return;
        }
        const codemodPath = join(
          vscode.workspace.rootPath!,
          "codemods",
          selection
        );

        try {
          const res = await execCodemod(
            codemodPath,
            {
              source,
              path: editor.document.fileName
            },
            editor.selection.start
          );

          if (res) {
            await replaceBuffer(res);
          } else {
            vscode.window.showInformationMessage("File skipped");
          }
        } catch (err) {
          vscode.window.showErrorMessage(
            `Transform error:\n${err.message}\n${err.stack}`
          );
        }
      } catch (err) {
        vscode.window.showErrorMessage(err.message);
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
    const files = await promisify(readdir)(getCodemodsDir()!);
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
  fileInfo: jscodeshift.FileInfo,
  position?: vscode.Position
): Promise<string | null> {
  const withParser = jscodeshift.withParser("tsx");

  for (const cacheKey of Object.keys(require.cache)) {
    if (require.resolve(cacheKey).startsWith(dirname(getCodemodsDir()!))) {
      delete require.cache[cacheKey];
    }
  }

  const module = require(path);

  const transformer = module.default || module;

  console.log("Running codemod", path);
  const res = transformer(
    fileInfo,
    {
      jscodeshift: withParser,
      j: withParser
    },
    position && {
      line: position.line + 1,
      column: position.character
    }
  );
  console.log("Finished running", path);
  return res;
}

async function showSelectionMenu(codemods: string[]) {
  return vscode.window.showQuickPick(codemods);
}

function getCodemodsDir() {
  return (
    vscode.workspace.rootPath && join(vscode.workspace.rootPath, "codemods")
  );
}
