// load-project.mjs — Shared project loader for TranslationStack skill scripts.
// Reads project.yaml, chunk_manifest.yaml, glossary/glossary.yaml,
// translations/chunks/*.jsonl, and review/issues.jsonl; assembles the
// data object that templates/review.html and serve.mjs consume.
//
// Bun/Node compatible. Zero third-party dependencies.
//
// Adapted from the YAML parser used in skills/translationstack/scripts/validator/io.mjs
// and the data assembly in .translationstack/building-effective-agents/export/render-review.mjs.
// These were duplicated copies; this module is the canonical home going forward.

import fs from "node:fs";
import path from "node:path";

// --- YAML parser (mirrors skills/translationstack/scripts/validator/io.mjs) ---

const YAML_BLOCK_SCALAR_PATTERN = /^[|>][+-]?\d*$/;

function stripComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== "\\") {
      quote = quote === char ? null : quote || char;
      continue;
    }
    if (char === "#" && !quote && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function countIndent(line) {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (YAML_BLOCK_SCALAR_PATTERN.test(trimmed)) {
    throw new Error(
      "unsupported YAML block scalar: contract files must use single-line notes"
    );
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "~") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => parseScalar(item));
  }
  return trimmed;
}

function parseKeyValue(text) {
  const index = text.indexOf(":");
  if (index === -1) return null;
  return { key: text.slice(0, index).trim(), valueText: text.slice(index + 1).trim() };
}

function preprocessYaml(text) {
  return text
    .replace(/\t/g, "  ")
    .split(/\r?\n/)
    .map((raw) => stripComment(raw).replace(/\s+$/, ""))
    .filter((line) => line.trim().length > 0)
    .map((line) => ({ indent: countIndent(line), text: line.trim() }));
}

function parseBlock(lines, startIndex, indent) {
  if (startIndex >= lines.length) return { value: {}, index: startIndex };
  const isArray =
    lines[startIndex].indent === indent && lines[startIndex].text.startsWith("- ");
  return isArray ? parseArray(lines, startIndex, indent) : parseObject(lines, startIndex, indent);
}

function parseArray(lines, startIndex, indent) {
  const array = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent !== indent || !line.text.startsWith("- ")) break;
    const itemText = line.text.slice(2).trim();
    if (!itemText) {
      const child = parseBlock(lines, index + 1, indent + 2);
      array.push(child.value);
      index = child.index;
      continue;
    }
    const kv = parseKeyValue(itemText);
    if (!kv) {
      array.push(parseScalar(itemText));
      index += 1;
      continue;
    }
    const item = {};
    if (kv.valueText) {
      item[kv.key] = parseScalar(kv.valueText);
      index += 1;
    } else {
      const child = parseBlock(lines, index + 1, indent + 2);
      item[kv.key] = child.value;
      index = child.index;
    }
    while (
      index < lines.length &&
      lines[index].indent === indent + 2 &&
      !lines[index].text.startsWith("- ")
    ) {
      const nested = parseKeyValue(lines[index].text);
      if (!nested) break;
      if (nested.valueText) {
        item[nested.key] = parseScalar(nested.valueText);
        index += 1;
      } else {
        const child = parseBlock(lines, index + 1, indent + 4);
        item[nested.key] = child.value;
        index = child.index;
      }
    }
    array.push(item);
  }
  return { value: array, index };
}

function parseObject(lines, startIndex, indent) {
  const object = {};
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent !== indent || line.text.startsWith("- ")) break;
    const kv = parseKeyValue(line.text);
    if (!kv) {
      index += 1;
      continue;
    }
    if (kv.valueText) {
      object[kv.key] = parseScalar(kv.valueText);
      index += 1;
    } else {
      const child = parseBlock(lines, index + 1, indent + 2);
      object[kv.key] = child.value;
      index = child.index;
    }
  }
  return { value: object, index };
}

function parseYaml(text) {
  const lines = preprocessYaml(text);
  if (lines.length === 0) return {};
  return parseBlock(lines, 0, lines[0].indent).value;
}

// --- File helpers ---

async function readText(file) {
  return fs.promises.readFile(file, "utf8");
}

async function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const text = await readText(file);
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    try {
      out.push(JSON.parse(line));
    } catch (e) {
      throw new Error(`bad JSONL at ${file}:${i + 1} — ${e.message}`);
    }
  }
  return out;
}

async function readYaml(file) {
  if (!fs.existsSync(file)) return {};
  return parseYaml(await readText(file));
}

// --- Loaders ---

async function loadProjectDoc(projectDir) {
  const doc = await readYaml(path.join(projectDir, "project.yaml"));
  return doc.project || {};
}

async function loadManifestChunks(projectDir) {
  const doc = await readYaml(path.join(projectDir, "chunk_manifest.yaml"));
  return Array.isArray(doc.chunks) ? doc.chunks : [];
}

async function loadGlossaryTerms(projectDir) {
  const doc = await readYaml(path.join(projectDir, "glossary", "glossary.yaml"));
  return Array.isArray(doc.terms) ? doc.terms : [];
}

async function loadAllTranslationRows(projectDir) {
  const transDir = path.join(projectDir, "translations", "chunks");
  if (!fs.existsSync(transDir)) return [];
  const files = await fs.promises.readdir(transDir);
  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
  const allRows = [];
  for (const file of jsonlFiles) {
    const rows = await readJsonl(path.join(transDir, file));
    allRows.push(...rows);
  }
  return allRows;
}

async function loadIssues(projectDir) {
  return readJsonl(path.join(projectDir, "review", "issues.jsonl"));
}

// --- Data assembly (matches templates/review.html consumption contract) ---

function buildData({ project, manifestChunks, glossaryTerms, transRows, issues }) {
  const transByChunk = new Map();
  for (const row of transRows) {
    const id = row.chunk_id || row.segment_id;
    if (id) transByChunk.set(id, row);
  }

  const issuesByTarget = new Map();
  for (const issue of issues) {
    const key = issue.target_id;
    if (!key) continue;
    if (!issuesByTarget.has(key)) issuesByTarget.set(key, []);
    issuesByTarget.get(key).push(issue);
  }

  const chunks = manifestChunks.map((mc) => {
    const row = transByChunk.get(mc.id);
    const chunkIssues = issuesByTarget.get(mc.id) || [];
    return {
      id: mc.id,
      title: mc.title,
      summary: mc.source_summary,
      state: (row && row.state) || mc.state || "pending",
      segments: row
        ? [
            {
              id: mc.id,
              source: row.source || "",
              target: row.target || "",
              state: row.state || "pending",
              issues: chunkIssues,
            },
          ]
        : [],
      issues: [],
    };
  });

  const stats = {
    chunks: chunks.length,
    translated: chunks.filter((c) =>
      ["translated", "reviewing", "reviewed", "exported"].includes(c.state)
    ).length,
    reviewed: chunks.filter((c) => ["reviewed", "exported"].includes(c.state)).length,
    openIssues: issues.filter((i) => i.status === "open").length,
    stale: chunks.filter((c) => ["stale", "blocked"].includes(c.state)).length,
  };

  return {
    project: {
      id: project.id,
      name: project.name,
      sourceLanguage: project.source_language,
      targetLanguage: project.target_language,
      domain: project.domain,
      summary: project.summary,
      generatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    },
    stats,
    glossary: glossaryTerms
      .filter((t) => t.status === "confirmed")
      .map((t) => ({ source: t.source, target: t.target, note: t.note })),
    chunks,
  };
}

// --- Public API ---

/**
 * Load a TranslationStack project and return all data needed by the review UI.
 *
 * @param {string} projectDir - Absolute or relative path to .translationstack/<project-id>/
 * @returns {Promise<{
 *   projectDir: string,
 *   project: object,
 *   manifestChunks: object[],
 *   glossaryTerms: object[],
 *   transRows: object[],
 *   issues: object[],
 *   data: { project, stats, glossary, chunks }
 * }>}
 */
export async function loadProject(projectDir) {
  const resolved = path.resolve(projectDir);
  const [project, manifestChunks, glossaryTerms, transRows, issues] = await Promise.all([
    loadProjectDoc(resolved),
    loadManifestChunks(resolved),
    loadGlossaryTerms(resolved),
    loadAllTranslationRows(resolved),
    loadIssues(resolved),
  ]);
  const data = buildData({ project, manifestChunks, glossaryTerms, transRows, issues });
  return {
    projectDir: resolved,
    project,
    manifestChunks,
    glossaryTerms,
    transRows,
    issues,
    data,
  };
}

// Exposed for ad-hoc debugging from CLI: `node load-project.mjs <projectDir>`
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node load-project.mjs <project-dir>");
    process.exit(2);
  }
  loadProject(target)
    .then(({ data }) => {
      console.log(
        JSON.stringify(
          {
            stats: data.stats,
            chunkCount: data.chunks.length,
            glossaryCount: data.glossary.length,
            project: data.project,
          },
          null,
          2
        )
      );
    })
    .catch((e) => {
      console.error("FAIL:", e.message);
      process.exit(1);
    });
}
