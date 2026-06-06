// render-review.mjs — Static render of export/review.html for a TranslationStack project.
//
// Usage:
//   bun skills/translationstack/scripts/render-review.mjs <project-dir>
//   node skills/translationstack/scripts/render-review.mjs <project-dir>
//
// Reads project files, assembles the data object, and writes a single
// self-contained review.html with the JSON baked in. Use this for
// share-mode / static-archive: the resulting file can be opened from
// file:// without a server.
//
// For interactive development with live updates, use serve.mjs instead.
//
// Bun/Node compatible. Zero third-party dependencies.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProject } from "./load-project.mjs";

const args = process.argv.slice(2);
let projectDirArg = null;
for (const arg of args) {
  if (arg.startsWith("-")) {
    console.error(`unknown flag: ${arg}`);
    process.exit(2);
  } else if (!projectDirArg) {
    projectDirArg = arg;
  }
}
if (!projectDirArg) {
  console.error("usage: render-review.mjs <project-dir>");
  process.exit(2);
}

const projectDir = path.resolve(projectDirArg);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(__dirname, "..", "templates", "review.html");
const OUT_PATH = path.join(projectDir, "export", "review.html");

async function main() {
  const loaded = await loadProject(projectDir);
  const data = loaded.data;

  // Fail-fast: refuse to bake an empty artifact. A successful render means
  // the project has at least one chunk and a project id.
  if (!loaded.project?.id) {
    throw new Error(
      `project ${projectDir} has no project.id in project.yaml; refusing to write review.html`
    );
  }
  if (!loaded.manifestChunks || loaded.manifestChunks.length === 0) {
    throw new Error(
      `project ${projectDir} has no chunks in chunk_manifest.yaml; refusing to write review.html`
    );
  }

  const template = await fs.promises.readFile(TEMPLATE_PATH, "utf8");

  // Serialize data to JSON. Use a function-form replace so any $` or $'
  // patterns in the JSON are NOT interpreted as String.prototype.replace
  // special tokens (the previous bug).
  let jsonData = JSON.stringify(data);

  // HTML-safety: the JSON is embedded inside <script type="application/json">.
  // HTML parsers end that script tag at the first literal "</script>". If a
  // translation chunk contains that sequence (e.g. inside a code block, a
  // scripture note, or an injected summary), it would close the data slot
  // and let attackers (or accidental content) execute arbitrary JS. Escape
  // the dangerous characters. JSON.parse handles \uXXXX escapes natively.
  jsonData = jsonData
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  // Sanity round-trip: ensure the JSON we are about to embed is parseable.
  // Catches any unintended mangling (e.g., BOMs, encoding issues) before
  // we burn them into the artifact.
  try {
    JSON.parse(jsonData);
  } catch (e) {
    throw new Error(
      `internal: loadProject produced invalid JSON (${e.message}); refusing to write review.html`
    );
  }

  const html = template.replace("__TRANSLATIONSTACK_DATA__", () => jsonData);

  await fs.promises.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.promises.writeFile(OUT_PATH, html, "utf8");

  const kb = (html.length / 1024).toFixed(1);
  const { manifestChunks, glossaryTerms, issues } = loaded;
  console.log(
    `Wrote ${OUT_PATH} (${kb} KB · ${manifestChunks.length} chunks · ${glossaryTerms.length} terms · ${issues.length} issues)`
  );
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
