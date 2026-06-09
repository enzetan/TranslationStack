import fs from "node:fs";
import path from "node:path";

import {
  CHUNK_ID_PATTERN,
  STATES_REQUIRING_TRANSLATION,
  VALID_CREATED_BY,
  VALID_ISSUE_STATUSES,
  VALID_ISSUE_TYPES,
  VALID_SCOPES,
  VALID_SEVERITIES,
  VALID_STATES,
  VALID_TERM_STATUSES,
} from "./constants.mjs";
import {
  assert,
  dirExists,
  extractMarkdownImageRefs,
  extractMarkers,
  fileExists,
  readJsonl,
  readText,
  readYaml,
  sameArray,
  validateMarkerBalance,
  warn,
} from "./io.mjs";

export function translationTarget(row) {
  return row.segment_id || row.chunk_id || row.target_id;
}

export function validateRequiredPaths(projectDir, phase, errors) {
  const requiredFilesByPhase = {
    pretranslate: [
      "project.yaml",
      "source/original.md",
      "chunk_manifest.yaml",
      "glossary/glossary.yaml",
      "style/style_guide.yaml",
      "review/issues.jsonl",
      "review/revisions.jsonl",
    ],
    translate: [
      "project.yaml",
      "source/original.md",
      "chunk_manifest.yaml",
      "project_brief.json",
      "glossary/glossary.yaml",
      "glossary/glossary_proposals.jsonl",
      "style/style_guide.yaml",
      "review/issues.jsonl",
      "review/revisions.jsonl",
      "memory/translation_memory.jsonl",
    ],
    review: [
      "project.yaml",
      "source/original.md",
      "chunk_manifest.yaml",
      "project_brief.json",
      "glossary/glossary.yaml",
      "glossary/glossary_proposals.jsonl",
      "style/style_guide.yaml",
      "review/issues.jsonl",
      "review/revisions.jsonl",
      "review/draft_qa_report.json",
      "memory/translation_memory.jsonl",
    ],
    final: [
      "project.yaml",
      "source/original.md",
      "chunk_manifest.yaml",
      "project_brief.json",
      "glossary/glossary.yaml",
      "glossary/glossary_proposals.jsonl",
      "style/style_guide.yaml",
      "review/issues.jsonl",
      "review/revisions.jsonl",
      "review/draft_qa_report.json",
      "memory/translation_memory.jsonl",
      "export/review.html",
      "export/output.md",
      "export/export_manifest.json",
      "export/export_qa_report.json",
    ],
  };

  const requiredFiles = requiredFilesByPhase[phase] || requiredFilesByPhase.final;
  const requiredDirs = ["review"];
  if (["translate", "review", "final"].includes(phase)) requiredDirs.push("translations/chunks", "runs");
  if (phase === "final") requiredDirs.push("export");

  for (const relativePath of requiredFiles) {
    assert(fileExists(path.join(projectDir, relativePath)), `Missing ${relativePath}`, errors);
  }

  for (const relativePath of requiredDirs) {
    assert(dirExists(path.join(projectDir, relativePath)), `Missing ${relativePath} directory`, errors);
  }
}

export function validateProject(projectDir, errors, warnings) {
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

export function validateManifest(projectDir, errors, warnings) {
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

export function validateGlossary(projectDir, errors, warnings) {
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

export function validateStyle(projectDir, errors, warnings) {
  const styleFile = path.join(projectDir, "style", "style_guide.yaml");
  assert(fileExists(styleFile), "Missing style/style_guide.yaml", errors);
  if (!fileExists(styleFile)) return {};

  const guide = readYaml(styleFile, errors);
  assert(guide.style, `${styleFile}: style section is required`, errors);
  warn(Boolean(guide.style?.strategy), `${styleFile}: style.strategy is missing`, warnings);
  warn(Boolean(guide.preferences), `${styleFile}: preferences section is missing`, warnings);

  return guide;
}

export function validateMemoryAndAgentLog(projectDir, phase, errors, warnings) {
  const memoryFile = path.join(projectDir, "memory", "translation_memory.jsonl");
  if (fileExists(memoryFile)) {
    const entries = readJsonl(memoryFile, errors);
    if (["translate", "review", "final"].includes(phase) && entries.length === 0) {
      warnings.push("memory/translation_memory.jsonl is empty; record reusable samples, preferences, or gotchas when the project creates them");
    }

    let gotchaCount = 0;
    for (const [index, entry] of entries.entries()) {
      if (entry.type === "gotcha") {
        gotchaCount += 1;
        for (const key of ["id", "scope", "trigger", "risk", "guidance", "evidence", "created_at", "status"]) {
          assert(entry[key], `memory/translation_memory.jsonl:${index + 1} gotcha missing ${key}`, errors);
        }
      }
    }

    if (["review", "final"].includes(phase) && entries.length > 0 && gotchaCount === 0) {
      warnings.push("memory/translation_memory.jsonl has entries but no type=gotcha records; add gotchas for recurring failure modes when present");
    }
  }

  const agentLogFile = path.join(projectDir, "runs", "agent_log.jsonl");
  if (!fileExists(agentLogFile)) {
    if (["translate", "review", "final"].includes(phase)) {
      warnings.push("Missing optional runs/agent_log.jsonl; add it when the project needs a handoff timeline across sessions, blockers, retries, validation results, or dynamic workflow batches");
    }
    return;
  }

  const logs = readJsonl(agentLogFile, errors);
  if (logs.length === 0) {
    warnings.push("runs/agent_log.jsonl is empty");
  }

  for (const [index, entry] of logs.entries()) {
    assert(entry.type === "agent_log", `runs/agent_log.jsonl:${index + 1} type must be agent_log`, errors);
    for (const key of ["timestamp", "run_id", "phase", "scope", "event", "result", "next_action", "files_touched"]) {
      assert(entry[key] !== undefined, `runs/agent_log.jsonl:${index + 1} missing ${key}`, errors);
    }
    if (entry.files_touched !== undefined) {
      assert(Array.isArray(entry.files_touched), `runs/agent_log.jsonl:${index + 1} files_touched must be an array`, errors);
    }
  }
}

export function validateIssues(projectDir, knownTargets, errors, warnings) {
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

export function buildTargetStateMap(chunks) {
  const states = new Map();
  for (const chunk of chunks) {
    states.set(chunk.id, chunk.state);
    for (const segment of Array.isArray(chunk.segments) ? chunk.segments : []) {
      states.set(segment.id, segment.status || chunk.state);
    }
  }
  return states;
}

export function validateTranslations(projectDir, knownTargets, targetStates, runIds, errors, warnings) {
  const chunksDir = path.join(projectDir, "translations", "chunks");
  if (!dirExists(chunksDir)) return [];

  const files = fs.readdirSync(chunksDir).filter(file => file.endsWith(".jsonl")).sort();
  const rows = [];
  const seenTargets = new Set();

  for (const file of files) {
    const fullPath = path.join(chunksDir, file);
    const fileRows = readJsonl(fullPath, errors);
    validateMarkdownCompanion(chunksDir, file, fileRows, warnings);

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
      if (row.run_id && runIds.size > 0) {
        assert(runIds.has(row.run_id), `${file}: ${targetId} references unknown run_id ${row.run_id}`, errors);
      }

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

function translationText(row) {
  if (row.target_markdown !== undefined) return String(row.target_markdown);
  if (row.target !== undefined) return String(row.target);
  return "";
}

function normalizeMarkdownForCompanionCheck(text) {
  return String(text).replace(/\r\n/g, "\n").trim();
}

function validateMarkdownCompanion(chunksDir, jsonlFile, rows, warnings) {
  const mdFile = jsonlFile.replace(/\.jsonl$/, ".md");
  const mdPath = path.join(chunksDir, mdFile);

  if (!fileExists(mdPath)) {
    warnings.push(`${jsonlFile}: missing companion Markdown file ${mdFile}; Markdown should be the human-readable translation source of truth`);
    return;
  }

  const markdown = normalizeMarkdownForCompanionCheck(readText(mdPath));
  if (!markdown) {
    warnings.push(`${mdFile}: companion Markdown file is empty`);
    return;
  }

  const target = normalizeMarkdownForCompanionCheck(rows.map(translationText).filter(Boolean).join("\n\n"));
  if (!target) {
    warnings.push(`${jsonlFile}: cannot compare companion Markdown because JSONL rows have no target or target_markdown text`);
    return;
  }

  if (markdown !== target) {
    warnings.push(`${jsonlFile}: companion Markdown ${mdFile} does not match concatenated JSONL target text after basic normalization`);
  }
}

export function validateTranslationCoverage(chunks, translations, errors) {
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
