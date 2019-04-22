import * as vscode from "vscode";
import * as jscodeshift from "jscodeshift";
import { join, dirname, basename } from "path";
import { register } from "ts-node";

const CODEMOD_GLOB = "codemods/**/*.cm.[tj]s";

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
      console.log("Activating codemod command");
      try {
        const codemods = await enumerateCodemods();
        if (codemods.length === 0) {
          vscode.window.showInformationMessage("No codemods were found");
          return;
        }

        const selection = await showSelectionMenu(codemods);
        if (!selection) {
          vscode.window.showInformationMessage("No selection");
          return;
        }

        try {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            console.warn("No active editor");
            return;
          }

          const source = editor.document.getText();

          const res = await execCodemod(
            selection.fsPath,
            {
              source,
              path: editor.document.fileName
            },
            editor.selection.start
          );

          if (!res) {
            vscode.window.showInformationMessage("File skipped");
            return;
          }
          await replaceBuffer(res);
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
  if (
    !vscode.workspace.workspaceFolders ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    throw new Error("Must be used in workspace");
  }
  return vscode.workspace.findFiles(
    new vscode.RelativePattern(
      vscode.workspace.workspaceFolders[0],
      CODEMOD_GLOB
    )
  );
}

async function execCodemod(
  path: string,
  fileInfo: jscodeshift.FileInfo,
  position?: vscode.Position
): Promise<string | null> {
  console.log("Starting codemod", path);
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

async function showSelectionMenu(codemods: vscode.Uri[]) {
  const pick = await vscode.window.showQuickPick(
    codemods.map(uri => ({
      uri,
      label: basename(uri.fsPath)
    }))
  );
  return pick && pick.uri;
}

function getCodemodsDir() {
  return (
    vscode.workspace.rootPath && join(vscode.workspace.rootPath, "codemods")
  );
}
