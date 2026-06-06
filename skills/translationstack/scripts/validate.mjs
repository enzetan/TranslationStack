#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const VALID_STATES = [
  "planned",
  "pending",
  "translated",
  "reviewing",
  "reviewed",
  "stale",
  "blocked",
  "exported",
];

const VALID_TRANSITIONS = {
  planned: ["pending", "blocked"],
  pending: ["translated", "blocked"],
  translated: ["reviewing", "reviewed", "stale", "blocked"],
  reviewing: ["reviewed", "translated", "stale", "blocked"],
  reviewed: ["exported", "stale", "reviewing"],
  stale: ["translated", "blocked"],
  blocked: ["planned", "pending", "translated", "reviewing"],
  exported: ["stale"],
};

const VALID_TERM_STATUSES = ["confirmed", "proposed", "rejected"];
const VALID_ISSUE_TYPES = [
  "term",
  "style",
  "accuracy",
  "omission",
  "addition",
  "marker",
  "format",
  "scripture_reference",
  "readability",
  "theological_precision",
];
const VALID_ISSUE_STATUSES = ["open", "resolved", "rejected", "closed"];
const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
const VALID_CREATED_BY = ["ai", "user", "system"];
const VALID_SCOPES = ["global", "book", "chunk", "segment", "project"];
const VALID_REVISION_OPS = [
  "set_translation",
  "set_term",
  "set_style",
  "set_state",
  "resolve_issue",
  "set_issue_status",
  "update_manifest",
];

const CHUNK_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*(?:[._-][a-zA-Z0-9]+)*$/;
const STATES_REQUIRING_TRANSLATION = ["translated", "reviewing", "reviewed", "stale", "exported"];
const EXPORTABLE_STATES = ["reviewed", "exported"];
const YAML_BLOCK_SCALAR_PATTERN = /^[|>][+-]?\d*$/;

function fileExists(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile();
}

function dirExists(dir) {
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

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
      "unsupported YAML block scalar; use quoted single-line strings or arrays instead of | or >"
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
    return inner.split(",").map(item => parseScalar(item));
  }
  return trimmed;
}

function parseKeyValue(text) {
  const index = text.indexOf(":");
  if (index === -1) return null;
  return {
    key: text.slice(0, index).trim(),
    valueText: text.slice(index + 1).trim(),
  };
}

function preprocessYaml(text) {
  return text
    .replace(/\t/g, "  ")
    .split(/\r?\n/)
    .map(raw => stripComment(raw).replace(/\s+$/, ""))
    .filter(line => line.trim().length > 0)
    .map(line => ({
      indent: countIndent(line),
      text: line.trim(),
    }));
}

function parseBlock(lines, startIndex, indent) {
  if (startIndex >= lines.length) return { value: {}, index: startIndex };

  const isArray = lines[startIndex].indent === indent && lines[startIndex].text.startsWith("- ");
  return isArray
    ? parseArray(lines, startIndex, indent)
    : parseObject(lines, startIndex, indent);
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

    while (index < lines.length && lines[index].indent === indent + 2 && !lines[index].text.startsWith("- ")) {
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

function readYaml(file, errors) {
  try {
    return parseYaml(readText(file));
  } catch (error) {
    errors.push(`${file}: invalid YAML: ${error.message}`);
    return {};
  }
}

function readJson(file, errors) {
  try {
    return JSON.parse(readText(file));
  } catch (error) {
    errors.push(`${file}: invalid JSON: ${error.message}`);
    return null;
  }
}

function readJsonl(file, errors) {
  if (!fileExists(file)) return [];

  return readText(file)
    .split(/\r?\n/)
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim().length > 0)
    .map(({ line, index }) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        errors.push(`${file}:${index + 1}: invalid JSONL row: ${error.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function warn(condition, message, warnings) {
  if (!condition) warnings.push(message);
}

function extractMarkers(text = "") {
  const markers = [];
  const markerPattern = /\{\{\/?[A-Za-z0-9_]+\}\}|<x\s+id="[^"]+"\s*\/>/g;
  let match;

  while ((match = markerPattern.exec(String(text))) !== null) {
    markers.push(match[0]);
  }

  return markers;
}

function markerName(marker) {
  const curly = marker.match(/^\{\{(\/?)([A-Za-z0-9_]+)\}\}$/);
  if (curly) return { closing: curly[1] === "/", name: curly[2], selfClosing: false };

  const xml = marker.match(/^<x\s+id="([^"]+)"\s*\/>$/);
  if (xml) return { closing: false, name: xml[1], selfClosing: true };

  return null;
}

function validateMarkerBalance(text, label, errors) {
  const stack = [];
  for (const marker of extractMarkers(text)) {
    const parsed = markerName(marker);
    if (!parsed) {
      errors.push(`${label}: invalid marker token ${marker}`);
      continue;
    }

    if (parsed.selfClosing) continue;

    if (!parsed.closing) {
      stack.push(parsed.name);
      continue;
    }

    const open = stack.pop();
    if (open !== parsed.name) errors.push(`${label}: unbalanced marker ${marker}`);
  }

  if (stack.length > 0) errors.push(`${label}: unclosed marker(s): ${stack.join(", ")}`);
}

function sameArray(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function extractMarkdownImageRefs(text = "") {
  const refs = [];
  const imagePattern = /!\[[^\]\n]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  let match;

  while ((match = imagePattern.exec(String(text))) !== null) {
    refs.push(match[1].replace(/^<|>$/g, ""));
  }

  return refs;
}

function isLocalRelativeRef(ref) {
  return Boolean(ref) && !/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(ref);
}

function validateMarkdownImageAssets(file, label, errors) {
  if (!fileExists(file)) return;

  const baseDir = path.dirname(file);
  for (const ref of extractMarkdownImageRefs(readText(file))) {
    if (!isLocalRelativeRef(ref)) continue;
    const resolved = path.resolve(baseDir, ref);
    assert(fileExists(resolved), `${label}: missing local image asset ${ref}`, errors);
  }
}

function translationTarget(row) {
  return row.segment_id || row.chunk_id || row.target_id;
}

function validateRequiredPaths(projectDir, errors) {
  const requiredFiles = [
    "project.yaml",
    "source/original.md",
    "chunk_manifest.yaml",
    "glossary/glossary.yaml",
    "glossary/glossary_proposals.jsonl",
    "style/style_guide.yaml",
    "review/issues.jsonl",
    "review/revisions.jsonl",
    "memory/translation_memory.jsonl",
    "export/review.html",
    "export/output.md",
    "export/export_manifest.json",
    "export/export_qa_report.json",
  ];

  const requiredDirs = ["translations/chunks", "runs"];

  for (const relativePath of requiredFiles) {
    assert(fileExists(path.join(projectDir, relativePath)), `Missing ${relativePath}`, errors);
  }

  for (const relativePath of requiredDirs) {
    assert(dirExists(path.join(projectDir, relativePath)), `Missing ${relativePath} directory`, errors);
  }
}

function validateProject(projectDir, errors, warnings) {
  const projectFile = path.join(projectDir, "project.yaml");
  assert(fileExists(projectFile), "Missing project.yaml", errors);
  if (!fileExists(projectFile)) return {};

  const project = readYaml(projectFile, errors);
  const info = project.project || {};

  for (const key of ["id", "name", "source_language", "target_language", "domain"]) {
    assert(info[key], `project.yaml: project.${key} is required`, errors);
  }

  assert(project.translation_policy, "project.yaml: translation_policy is required", errors);
  assert(project.review_policy, "project.yaml: review_policy is required", errors);
  assert(project.export_policy, "project.yaml: export_policy is required", errors);

  warn(
    project.review_policy?.export_requires_reviewed === true,
    "project.yaml: review_policy.export_requires_reviewed should default to true",
    warnings
  );

  return project;
}

function parseLineAnchor(anchor) {
  if (typeof anchor !== "string") return null;
  const match = anchor.match(/^(.+)#lines-(\d+)-(\d+)$/);
  if (!match) return null;
  return {
    file: match[1],
    start: Number(match[2]),
    end: Number(match[3]),
  };
}

function validateSourceAnchor(projectDir, anchor, expectedCoverage, label, errors) {
  const parsed = parseLineAnchor(anchor);
  if (!parsed) {
    errors.push(`${label}: source_anchor is not in source/original.md#lines-x-y form`);
    return;
  }

  const sourceFile = path.join(projectDir, parsed.file);
  assert(fileExists(sourceFile), `${label}: source anchor file does not exist: ${parsed.file}`, errors);
  if (!fileExists(sourceFile)) return;

  const lineCount = readText(sourceFile).split(/\r?\n/).length;
  assert(parsed.start > 0, `${label}: source anchor start must be positive`, errors);
  assert(parsed.end >= parsed.start, `${label}: source anchor end must be >= start`, errors);
  assert(parsed.end <= lineCount, `${label}: source anchor exceeds source line count (${lineCount})`, errors);

  if (expectedCoverage?.start !== undefined && expectedCoverage?.end !== undefined) {
    assert(
      parsed.start === expectedCoverage.start && parsed.end === expectedCoverage.end,
      `${label}: source_anchor lines ${parsed.start}-${parsed.end} do not match coverage ${expectedCoverage.start}-${expectedCoverage.end}`,
      errors
    );
  }
}

function validateManifest(projectDir, errors, warnings) {
  const manifestFile = path.join(projectDir, "chunk_manifest.yaml");
  assert(fileExists(manifestFile), "Missing chunk_manifest.yaml", errors);
  if (!fileExists(manifestFile)) return { chunks: [], chunkIds: new Set(), segmentIds: new Set() };

  const manifest = readYaml(manifestFile, errors);
  const chunks = manifest.chunks || [];
  assert(Array.isArray(chunks), "chunk_manifest.yaml: chunks must be an array", errors);

  const chunkIds = new Set();
  const segmentIds = new Set();
  const coverageRanges = [];

  for (const chunk of Array.isArray(chunks) ? chunks : []) {
    const id = chunk?.id;
    assert(id, "Chunk missing id", errors);
    assert(CHUNK_ID_PATTERN.test(id || ""), `Invalid chunk id: ${id}`, errors);
    assert(!chunkIds.has(id), `Duplicate chunk id: ${id}`, errors);
    if (id) chunkIds.add(id);

    for (const key of ["title", "source_anchor", "source_summary", "chunk_type", "semantic_role"]) {
      assert(chunk?.[key], `Chunk ${id || "(missing id)"} missing ${key}`, errors);
    }

    assert(VALID_STATES.includes(chunk?.state), `Chunk ${id || "(missing id)"} has invalid state: ${chunk?.state}`, errors);

    if (!chunk?.must_preserve || !Array.isArray(chunk.must_preserve) || chunk.must_preserve.length === 0) {
      warnings.push(`Chunk ${id || "(missing id)"} has empty must_preserve`);
    }

    const coverage = chunk?.coverage || {};
    assert(Number.isInteger(coverage.start), `Chunk ${id} coverage.start must be an integer`, errors);
    assert(Number.isInteger(coverage.end), `Chunk ${id} coverage.end must be an integer`, errors);
    if (Number.isInteger(coverage.start) && Number.isInteger(coverage.end)) {
      assert(coverage.start > 0, `Chunk ${id} coverage.start must be positive`, errors);
      assert(coverage.end >= coverage.start, `Chunk ${id} coverage.end must be >= start`, errors);
      coverageRanges.push({ id, start: coverage.start, end: coverage.end });
    }
    warn(Boolean(coverage.confidence), `Chunk ${id} coverage.confidence is missing`, warnings);

    if (chunk?.source_anchor) {
      validateSourceAnchor(projectDir, chunk.source_anchor, coverage, `Chunk ${id}`, errors);
    }

    if (chunk?.segments !== undefined) {
      assert(Array.isArray(chunk.segments), `Chunk ${id}: segments must be an array`, errors);

      for (const segment of Array.isArray(chunk.segments) ? chunk.segments : []) {
        const segmentId = segment?.id;
        assert(segmentId, `Chunk ${id}: segment missing id`, errors);
        assert(
          typeof segmentId === "string" && segmentId.startsWith(`${id}:`),
          `Segment ${segmentId} must start with parent chunk id ${id}:`,
          errors
        );
        assert(!segmentIds.has(segmentId), `Duplicate segment id: ${segmentId}`, errors);
        if (segmentId) segmentIds.add(segmentId);

        if (segment.status !== undefined) {
          assert(VALID_STATES.includes(segment.status), `Segment ${segmentId} has invalid status: ${segment.status}`, errors);
        }

        warn(Boolean(segment.source || segment.source_anchor), `Segment ${segmentId} has neither source nor source_anchor`, warnings);

        if (segment.source_anchor) {
          validateSourceAnchor(projectDir, segment.source_anchor, null, `Segment ${segmentId}`, errors);
        }
      }
    }
  }

  const sourceFile = path.join(projectDir, "source", "original.md");
  const sourceLines = fileExists(sourceFile) ? readText(sourceFile).split(/\r?\n/) : [];
  const sortedCoverage = coverageRanges.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < sortedCoverage.length; index += 1) {
    const prev = sortedCoverage[index - 1];
    const next = sortedCoverage[index];
    if (next.start <= prev.end) {
      warnings.push(`Coverage overlap: ${prev.id} (${prev.start}-${prev.end}) and ${next.id} (${next.start}-${next.end})`);
    }
    if (next.start > prev.end + 1) {
      const skippedLines = sourceLines.slice(prev.end, next.start - 1);
      if (skippedLines.some(line => line.trim().length > 0)) {
        errors.push(`Coverage gap between ${prev.id} (${prev.end}) and ${next.id} (${next.start})`);
      }
    }
  }

  return { chunks: Array.isArray(chunks) ? chunks : [], chunkIds, segmentIds };
}

function validateGlossary(projectDir, errors, warnings) {
  const glossaryFile = path.join(projectDir, "glossary", "glossary.yaml");
  assert(fileExists(glossaryFile), "Missing glossary/glossary.yaml", errors);
  if (!fileExists(glossaryFile)) return [];

  const glossary = readYaml(glossaryFile, errors);
  const terms = glossary.terms || [];
  assert(Array.isArray(terms), `${glossaryFile}: terms must be an array`, errors);

  const seenSources = new Set();
  for (const term of Array.isArray(terms) ? terms : []) {
    assert(term.source, `${glossaryFile}: term missing source`, errors);
    assert(
      VALID_TERM_STATUSES.includes(term.status),
      `${glossaryFile}: term ${term.source || "(missing source)"} has invalid status: ${term.status}`,
      errors
    );

    const key = String(term.source || "").trim().toLowerCase();
    if (key) {
      assert(!seenSources.has(key), `${glossaryFile}: duplicate term source: ${term.source}`, errors);
      seenSources.add(key);
    }

    if (term.status === "confirmed") {
      assert(term.target, `${glossaryFile}: confirmed term ${term.source} missing target`, errors);
    }

    warn(Boolean(term.note), `${glossaryFile}: term ${term.source || "(missing source)"} missing note`, warnings);
  }

  return terms;
}

function validateStyle(projectDir, errors, warnings) {
  const styleFile = path.join(projectDir, "style", "style_guide.yaml");
  assert(fileExists(styleFile), "Missing style/style_guide.yaml", errors);
  if (!fileExists(styleFile)) return {};

  const guide = readYaml(styleFile, errors);
  assert(guide.style, `${styleFile}: style section is required`, errors);
  warn(Boolean(guide.style?.strategy), `${styleFile}: style.strategy is missing`, warnings);
  warn(Boolean(guide.preferences), `${styleFile}: preferences section is missing`, warnings);

  return guide;
}

function validateIssues(projectDir, knownTargets, errors, warnings) {
  const issuesFile = path.join(projectDir, "review", "issues.jsonl");
  if (!fileExists(issuesFile)) return [];
  const issues = readJsonl(issuesFile, errors);
  const issueIds = new Set();

  for (const issue of issues) {
    assert(issue.id, "Issue missing id", errors);
    assert(!issueIds.has(issue.id), `Duplicate issue id: ${issue.id}`, errors);
    if (issue.id) issueIds.add(issue.id);

    assert(issue.target_id, `Issue ${issue.id || "(missing id)"} missing target_id`, errors);
    assert(knownTargets.has(issue.target_id), `Issue ${issue.id || "(missing id)"} points to unknown target: ${issue.target_id}`, errors);
    assert(VALID_ISSUE_TYPES.includes(issue.type), `Issue ${issue.id || "(missing id)"} has invalid type: ${issue.type}`, errors);
    assert(VALID_ISSUE_STATUSES.includes(issue.status), `Issue ${issue.id || "(missing id)"} has invalid status: ${issue.status}`, errors);
    assert(VALID_CREATED_BY.includes(issue.created_by), `Issue ${issue.id || "(missing id)"} has invalid created_by: ${issue.created_by}`, errors);

    if (issue.severity !== undefined) {
      assert(VALID_SEVERITIES.includes(issue.severity), `Issue ${issue.id || "(missing id)"} has invalid severity: ${issue.severity}`, errors);
    } else {
      warnings.push(`Issue ${issue.id || "(missing id)"} missing severity`);
    }

    assert(issue.note, `Issue ${issue.id || "(missing id)"} missing note`, errors);
    if (issue.scope !== undefined) {
      assert(VALID_SCOPES.includes(issue.scope), `Issue ${issue.id || "(missing id)"} has invalid scope: ${issue.scope}`, errors);
    }
  }

  return issues;
}

function validateRevisions(projectDir, knownTargets, errors, warnings) {
  const revisionsFile = path.join(projectDir, "review", "revisions.jsonl");
  if (!fileExists(revisionsFile)) return [];
  const revisions = readJsonl(revisionsFile, errors);

  for (const patch of revisions) {
    assert(VALID_REVISION_OPS.includes(patch.op), `Revision has invalid op: ${patch.op}`, errors);
    assert(patch.target_id, `Revision ${patch.op || "(missing op)"} missing target_id`, errors);

    if (patch.target_id && !patch.target_id.startsWith("glossary:")) {
      assert(knownTargets.has(patch.target_id), `Revision ${patch.op || "(missing op)"} points to unknown target: ${patch.target_id}`, errors);
    }

    warn(Boolean(patch.created_at), `Revision ${patch.op || "(missing op)"} missing created_at`, warnings);
    warn(Boolean(patch.source), `Revision ${patch.op || "(missing op)"} missing source`, warnings);
    warn(Boolean(patch.reason), `Revision ${patch.op || "(missing op)"} missing reason`, warnings);

    if (patch.op === "set_state") {
      const from = patch.value?.from;
      const to = patch.value?.to;
      assert(VALID_STATES.includes(from), `Invalid from state: ${from}`, errors);
      assert(VALID_STATES.includes(to), `Invalid to state: ${to}`, errors);
      assert(VALID_TRANSITIONS[from]?.includes(to), `Illegal state transition: ${from} -> ${to}`, errors);
    }

    if (patch.op === "set_translation") {
      const source = patch.value?.source || "";
      const target = patch.value?.target || "";
      validateMarkerBalance(source, `Revision ${patch.target_id} source`, errors);
      validateMarkerBalance(target, `Revision ${patch.target_id} target`, errors);
      const sourceMarkers = extractMarkers(source);
      const targetMarkers = extractMarkers(target);
      assert(sameArray(sourceMarkers, targetMarkers), `Marker mismatch in translation patch for ${patch.target_id}`, errors);
      assert(target.trim().length > 0, `Empty target in translation patch for ${patch.target_id}`, errors);
    }
  }

  return revisions;
}

function buildTargetStateMap(chunks) {
  const states = new Map();
  for (const chunk of chunks) {
    states.set(chunk.id, chunk.state);
    for (const segment of Array.isArray(chunk.segments) ? chunk.segments : []) {
      states.set(segment.id, segment.status || chunk.state);
    }
  }
  return states;
}

function validateTranslations(projectDir, knownTargets, targetStates, errors, warnings) {
  const chunksDir = path.join(projectDir, "translations", "chunks");
  if (!dirExists(chunksDir)) return [];

  const files = fs.readdirSync(chunksDir).filter(file => file.endsWith(".jsonl")).sort();
  const rows = [];
  const seenTargets = new Set();

  for (const file of files) {
    const fullPath = path.join(chunksDir, file);
    const fileRows = readJsonl(fullPath, errors);

    for (const row of fileRows) {
      const targetId = translationTarget(row);
      rows.push(row);

      assert(targetId, `${file}: translation row missing segment_id or chunk_id`, errors);
      assert(knownTargets.has(targetId), `${file}: unknown translation target ${targetId}`, errors);
      assert(!seenTargets.has(targetId), `${file}: duplicate translation target ${targetId}`, errors);
      if (targetId) seenTargets.add(targetId);

      if (row.state !== undefined) {
        assert(VALID_STATES.includes(row.state), `${file}: ${targetId} has invalid state: ${row.state}`, errors);
        if (targetStates.has(targetId)) {
          assert(
            row.state === targetStates.get(targetId),
            `${file}: ${targetId} state ${row.state} does not match manifest state ${targetStates.get(targetId)}`,
            errors
          );
        }
      }

      assert(row.glossary_hash, `${file}: ${targetId} missing glossary_hash`, errors);
      assert(row.style_hash, `${file}: ${targetId} missing style_hash`, errors);
      assert(row.run_id, `${file}: ${targetId} missing run_id`, errors);

      if (row.source && (row.target || row.target_markdown)) {
        const targetText = row.target || row.target_markdown;
        validateMarkerBalance(row.source, `${file}: ${targetId} source`, errors);
        validateMarkerBalance(targetText, `${file}: ${targetId} target`, errors);
        const sourceMarkers = extractMarkers(row.source);
        const targetMarkers = extractMarkers(targetText);
        assert(sameArray(sourceMarkers, targetMarkers), `${file}: marker mismatch for ${targetId}`, errors);

        const sourceImageRefs = extractMarkdownImageRefs(row.source);
        const targetImageRefs = extractMarkdownImageRefs(targetText);
        assert(sameArray(sourceImageRefs, targetImageRefs), `${file}: image reference mismatch for ${targetId}`, errors);
      }

      if (row.target !== undefined) {
        assert(String(row.target).trim().length > 0, `${file}: ${targetId} has empty target`, errors);
      }
      if (row.target_markdown !== undefined) {
        assert(String(row.target_markdown).trim().length > 0, `${file}: ${targetId} has empty target_markdown`, errors);
      }
    }
  }

  return rows;
}

function validateTranslationCoverage(chunks, translations, errors) {
  const translatedTargets = new Set(translations.map(translationTarget).filter(Boolean));

  for (const chunk of chunks) {
    if (!STATES_REQUIRING_TRANSLATION.includes(chunk.state)) continue;
    if (translatedTargets.has(chunk.id)) continue;

    const segments = Array.isArray(chunk.segments) ? chunk.segments : [];
    if (segments.length === 0) {
      assert(translatedTargets.has(chunk.id), `Missing translation row for ${chunk.id} with state ${chunk.state}`, errors);
      continue;
    }

    for (const segment of segments) {
      const status = segment.status || chunk.state;
      if (STATES_REQUIRING_TRANSLATION.includes(status)) {
        assert(
          translatedTargets.has(segment.id),
          `Missing translation row for ${segment.id} with state ${status}; alternatively provide a chunk-level row for ${chunk.id}`,
          errors
        );
      }
    }
  }
}

function readImpactReports(projectDir, errors) {
  const reviewDir = path.join(projectDir, "review");
  if (!dirExists(reviewDir)) return [];

  return fs.readdirSync(reviewDir)
    .filter(file => /^impact-.*\.json$/.test(file))
    .sort()
    .map(file => ({ file, report: readJson(path.join(reviewDir, file), errors) }))
    .filter(item => item.report);
}

function validateImpactReports(projectDir, chunks, revisions, errors) {
  const impactRequiringRevisions = revisions.filter(patch => ["set_term", "set_style"].includes(patch.op));
  if (impactRequiringRevisions.length === 0) return;

  const impactReports = readImpactReports(projectDir, errors);
  assert(impactReports.length > 0, "Term/style revisions require at least one review/impact-*.json report", errors);

  for (const patch of impactRequiringRevisions) {
    const expectedTerm = patch.op === "set_term"
      ? String(patch.value?.source || patch.target_id?.replace(/^glossary:/, "") || "")
      : "";
    const hasMatchingReport = impactReports.some(({ report }) => {
      if (patch.op === "set_style") return String(report.trigger?.type || "").includes("style");
      return report.trigger?.source === expectedTerm;
    });
    assert(hasMatchingReport, `Revision ${patch.op} ${patch.target_id} requires a matching impact report trigger`, errors);
  }

  const chunkStateById = new Map(chunks.map(chunk => [chunk.id, chunk.state]));
  const staleRevisionTargets = new Set(
    revisions
      .filter(patch => patch.op === "set_state" && patch.value?.to === "stale")
      .map(patch => patch.target_id)
  );

  for (const { file, report } of impactReports) {
    assert(report.trigger?.type, `${file}: trigger.type is required`, errors);
    assert(Array.isArray(report.affected_chunks), `${file}: affected_chunks must be an array`, errors);

    for (const affected of Array.isArray(report.affected_chunks) ? report.affected_chunks : []) {
      assert(chunkStateById.has(affected.id), `${file}: unknown affected chunk ${affected.id}`, errors);
      assert(affected.next_state === "stale", `${file}: affected chunk ${affected.id} next_state must be stale`, errors);
      if (chunkStateById.has(affected.id)) {
        const currentState = chunkStateById.get(affected.id);
        assert(
          currentState === "stale" || staleRevisionTargets.has(affected.id),
          `${file}: affected chunk ${affected.id} is not stale and has no set_state -> stale revision`,
          errors
        );
      }
    }
  }
}

function validateExport(projectDir, project, chunks, issues, translations, glossaryTerms, errors, warnings) {
  const exportDir = path.join(projectDir, "export");
  if (!dirExists(exportDir)) return;

  const manifestFile = path.join(exportDir, "export_manifest.json");
  const manifest = fileExists(manifestFile) ? readJson(manifestFile, errors) : null;

  const qaFile = path.join(exportDir, "export_qa_report.json");
  let qaReport = null;
  if (fileExists(qaFile)) {
    qaReport = readJson(qaFile, errors);
    if (qaReport) warn(qaReport.ok !== undefined, "export_qa_report.json: ok field is missing", warnings);
  }

  const outputFile = path.join(exportDir, "output.md");
  if (!fileExists(outputFile)) return;
  validateMarkdownImageAssets(outputFile, "export/output.md", errors);

  const draftExport = project.export_policy?.draft_export === true || qaReport?.draft_export === true;
  const chunkStateById = new Map(chunks.map(chunk => [chunk.id, chunk.state]));
  const exportedChunks = Array.isArray(manifest?.chunks) ? manifest.chunks : [];
  const exportedChunkIds = new Set(exportedChunks.map(chunk => chunk.id).filter(Boolean));

  assert(Array.isArray(manifest?.chunks), "export_manifest.json: chunks must be an array", errors);
  assert(exportedChunkIds.size > 0, "export_manifest.json: at least one exported chunk is required", errors);

  for (const chunkId of exportedChunkIds) {
    assert(chunkStateById.has(chunkId), `export_manifest.json: unknown exported chunk ${chunkId}`, errors);
    const state = chunkStateById.get(chunkId);
    if (!EXPORTABLE_STATES.includes(state)) {
      const message = `Export includes non-reviewed chunk ${chunkId} with state ${state}`;
      if (draftExport) warnings.push(`${message} (allowed by draft_export)`);
      else errors.push(message);
    }
  }

  for (const exportedChunk of exportedChunks) {
    if (!Array.isArray(exportedChunk.translation_files)) continue;
    for (const relativeFile of exportedChunk.translation_files) {
      assert(fileExists(path.join(projectDir, relativeFile)), `export_manifest.json: missing translation file ${relativeFile}`, errors);
    }
  }

  const exportedTranslations = translations.filter(row => exportedChunkIds.has(String(translationTarget(row)).split(":")[0]));
  if (exportedTranslations.length === 0) {
    const message = "Export exists but no exported translation rows were found";
    if (draftExport) warnings.push(`${message} (allowed by draft_export)`);
    else errors.push(message);
  }

  const highOpenIssues = issues.filter(issue =>
    issue.status === "open" && ["high", "critical"].includes(issue.severity)
  );
  if (highOpenIssues.length > 0) {
    const message = `Export exists with open high/critical issues: ${highOpenIssues.map(issue => issue.id).join(", ")}`;
    if (draftExport) warnings.push(`${message} (allowed by draft_export)`);
    else errors.push(message);
  }

  if (qaReport?.ok === false || (Array.isArray(qaReport?.errors) && qaReport.errors.length > 0)) {
    const message = "Export QA report is not ok";
    if (draftExport) warnings.push(`${message} (allowed by draft_export)`);
    else errors.push(message);
  }

  const proposedCoreTerms = glossaryTerms.filter(term =>
    term.status === "proposed" && (term.core === true || ["global", "book", "project"].includes(term.scope))
  );
  if (proposedCoreTerms.length > 0) {
    const message = `Export exists with unconfirmed core/global glossary terms: ${proposedCoreTerms.map(term => term.source).join(", ")}`;
    if (draftExport) warnings.push(`${message} (allowed by draft_export)`);
    else errors.push(message);
  }
}

function main() {
  const projectDir = process.argv[2];

  if (!projectDir) {
    console.error("Usage: node skills/translationstack/scripts/validate.mjs .translationstack/<project-id>");
    process.exit(2);
  }

  const resolvedProjectDir = path.resolve(projectDir);
  const errors = [];
  const warnings = [];

  assert(dirExists(resolvedProjectDir), `Project directory does not exist: ${resolvedProjectDir}`, errors);

  if (dirExists(resolvedProjectDir)) {
    validateRequiredPaths(resolvedProjectDir, errors);
    validateMarkdownImageAssets(path.join(resolvedProjectDir, "source", "original.md"), "source/original.md", errors);
    const project = validateProject(resolvedProjectDir, errors, warnings);
    const { chunks, chunkIds, segmentIds } = validateManifest(resolvedProjectDir, errors, warnings);
    const knownTargets = new Set([...chunkIds, ...segmentIds]);
    const glossaryTerms = validateGlossary(resolvedProjectDir, errors, warnings);
    validateStyle(resolvedProjectDir, errors, warnings);
    const issues = validateIssues(resolvedProjectDir, knownTargets, errors, warnings);
    const revisions = validateRevisions(resolvedProjectDir, knownTargets, errors, warnings);
    const targetStates = buildTargetStateMap(chunks);
    const translations = validateTranslations(resolvedProjectDir, knownTargets, targetStates, errors, warnings);
    validateTranslationCoverage(chunks, translations, errors);
    validateImpactReports(resolvedProjectDir, chunks, revisions, errors);
    validateExport(resolvedProjectDir, project, chunks, issues, translations, glossaryTerms, errors, warnings);
  }

  const report = {
    ok: errors.length === 0,
    projectDir: resolvedProjectDir,
    errors,
    warnings,
    stats: {
      errors: errors.length,
      warnings: warnings.length,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  if (errors.length > 0) process.exit(1);
}

main();
