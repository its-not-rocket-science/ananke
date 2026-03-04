// tools/lint-open.mjs
import { spawnSync } from "node:child_process";
import { ESLint } from "eslint";

function openInVSCode(files) {
  if (!files.length) return;

  // --reuse-window avoids popping a new window per run
  const r = spawnSync("code", ["--reuse-window", ...files], {
    stdio: "inherit",
    shell: true, // helps on Windows with PATH resolution
  });

  if (r.status !== 0) {
    console.error(
      "\nCould not run `code` to open files. In VS Code: Command Palette → " +
        "“Shell Command: Install 'code' command in PATH”.\n",
    );
  }
}

const eslint = new ESLint();
const results = await eslint.lintFiles(["."]);

// Print human-readable output (no JSON spam)
const formatter = await eslint.loadFormatter("stylish");
const text = formatter.format(results);
if (text.trim()) {
  process.stdout.write(text);
}

// Collect failing files (errors OR warnings). If you only want errors, remove warningCount.
const failingFiles = results
  .filter((r) => (r.errorCount ?? 0) > 0 || (r.warningCount ?? 0) > 0)
  .map((r) => r.filePath)
  .filter(Boolean);

openInVSCode(failingFiles);

// Exit like ESLint: fail if there are any errors
const hasErrors = results.some((r) => (r.errorCount ?? 0) > 0);
process.exit(hasErrors ? 1 : 0);