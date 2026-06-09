import fs from "node:fs";
import path from "node:path";

import {
  VALID_EXECUTION_MODES,
  VALID_REVISION_OPS,
  VALID_RUN_TYPES,
  VALID_SEVERITIES,
  VALID_STATES,
  VALID_TOOLS_USED,
  VALID_TRANSITIONS,
} from "./constants.mjs";
import {
  assert,
  assertTimestamp,
  dirExists,
  fileExists,
  isCheckTrue,
  isNonEmptyArray,
  isNonEmptyString,
  isPlainRelativePath,
  looksLikeTimestamp,
  readJson,
  readJsonl,
  sameArray,
  validateMarkerBalance,
  extractMarkers,
  warn,
} from "./io.mjs";

export function validateProjectBrief(projectDir, phase, errors, warnings) {
  if (phase === "pretranslate") return null;

  const briefFile = path.join(projectDir, "project_brief.json");
  if (!fileExists(briefFile)) return null;

  const brief = readJson(briefFile, errors);
  if (!brief) return null;

  assertTimestamp(brief.generated_at, "project_brief.json: generated_at", errors);
  for (const key of ["audience", "purpose", "genre", "tone", "domain", "thesis", "quality_bar"]) {
    assert(isNonEmptyString(brief[key]), `project_brief.json: ${key} is required`, errors);
  }

  assert(brief.source?.file === "source/original.md", "project_brief.json: source.file must be source/original.md", errors);
  assert(fileExists(path.join(projectDir, "source", "original.md")), "project_brief.json: source/original.md does not exist", errors);

  assert(brief.coverage, "project_brief.json: coverage is required", errors);
  assert(["full", "partial"].includes(brief.coverage?.mode), "project_brief.json: coverage.mode must be full or partial", errors);
  assert(isNonEmptyArray(brief.coverage?.source_ranges), "project_brief.json: coverage.source_ranges must be a non-empty array", errors);
  if (brief.coverage?.mode === "partial") {
    warn(isNonEmptyArray(brief.coverage?.limitations), "project_brief.json: partial coverage should record limitations", warnings);
  }

  for (const key of ["structure", "recurring_terms", "risks", "execution_signals"]) {
    assert(Array.isArray(brief[key]), `project_brief.json: ${key} must be an array`, errors);
  }

  assert(isNonEmptyString(brief.reference_policy), "project_brief.json: reference_policy is required", errors);

  return brief;
}

export function validateRevisions(projectDir, knownTargets, errors, warnings) {
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

export function validateRuns(projectDir, phase, errors, warnings) {
  const runIds = new Set();
  if (phase === "pretranslate") return { runs: [], runIds };

  const runsDir = path.join(projectDir, "runs");
  assert(dirExists(runsDir), "Missing runs directory", errors);
  if (!dirExists(runsDir)) return { runs: [], runIds };

  const files = fs.readdirSync(runsDir).filter(file => file.endsWith(".json")).sort();
  assert(files.length > 0, "runs/: at least one run record is required", errors);

  const runs = [];
  for (const file of files) {
    const fullPath = path.join(runsDir, file);
    const run = readJson(fullPath, errors);
    if (!run) continue;
    runs.push(run);

    const label = `runs/${file}`;
    assert(isNonEmptyString(run.run_id), `${label}: run_id is required`, errors);
    if (run.run_id) {
      assert(!runIds.has(run.run_id), `${label}: duplicate run_id ${run.run_id}`, errors);
      runIds.add(run.run_id);
      assert(file === `${run.run_id}.json`, `${label}: filename must match run_id`, errors);
    }

    assert(VALID_RUN_TYPES.includes(run.type), `${label}: invalid type ${run.type}`, errors);
    assert(VALID_EXECUTION_MODES.includes(run.execution_mode), `${label}: invalid execution_mode ${run.execution_mode}`, errors);
    assert(VALID_TOOLS_USED.includes(run.tool_used), `${label}: invalid tool_used ${run.tool_used}`, errors);
    assertTimestamp(run.started_at, `${label}: started_at`, errors);
    assertTimestamp(run.ended_at, `${label}: ended_at`, errors);
    if (looksLikeTimestamp(run.started_at) && looksLikeTimestamp(run.ended_at)) {
      assert(Date.parse(run.ended_at) >= Date.parse(run.started_at), `${label}: ended_at must be >= started_at`, errors);
    }

    for (const key of ["inputs", "outputs", "limitations"]) {
      assert(Array.isArray(run[key]), `${label}: ${key} must be an array`, errors);
    }
    if (Array.isArray(run.inputs)) {
      for (const input of run.inputs) {
        assert(isNonEmptyString(input), `${label}: inputs entries must be non-empty strings`, errors);
        if (isPlainRelativePath(input)) {
          warn(fileExists(path.join(projectDir, input)), `${label}: input path does not exist: ${input}`, warnings);
        }
      }
    }
    if (Array.isArray(run.outputs)) {
      for (const output of run.outputs) {
        assert(isNonEmptyString(output), `${label}: outputs entries must be non-empty strings`, errors);
      }
    }

    if (run.execution_mode === "sub-agent") {
      assert(run.tool_used === "Agent", `${label}: sub-agent runs must use tool_used Agent`, errors);
      assert(isNonEmptyArray(run.agents), `${label}: sub-agent runs require agents`, errors);
      assert(isNonEmptyArray(run.merge_decisions), `${label}: sub-agent runs require merge_decisions`, errors);
      for (const [index, agent] of Array.isArray(run.agents) ? run.agents.entries() : []) {
        assert(isNonEmptyString(agent.role), `${label}: agents[${index}].role is required`, errors);
      }
    }

    if (run.execution_mode === "dynamic-workflow") {
      assert(run.tool_used === "DynamicWorkflow", `${label}: dynamic-workflow runs must use tool_used DynamicWorkflow`, errors);
      assert(run.workflow_script, `${label}: dynamic-workflow runs require workflow_script`, errors);
      assert(isNonEmptyString(run.workflow_script?.path), `${label}: workflow_script.path is required`, errors);
      assert(isNonEmptyString(run.workflow_script?.hash), `${label}: workflow_script.hash is required`, errors);
      assert(isNonEmptyArray(run.phases) || isNonEmptyArray(run.batches), `${label}: dynamic-workflow runs require phases or batches`, errors);
      assert(Array.isArray(run.errors), `${label}: dynamic-workflow runs require errors array`, errors);
      assert(Array.isArray(run.retries), `${label}: dynamic-workflow runs require retries array`, errors);
    }
  }

  return { runs, runIds };
}

export function validateDraftQa(projectDir, phase, knownTargets, runIds, errors, warnings) {
  if (!["review", "final"].includes(phase)) return null;

  const qaFile = path.join(projectDir, "review", "draft_qa_report.json");
  if (!fileExists(qaFile)) return null;

  const report = readJson(qaFile, errors);
  if (!report) return null;

  assert(report.ok === true, "review/draft_qa_report.json: ok must be true before pre-review/final export", errors);
  assertTimestamp(report.generated_at, "review/draft_qa_report.json: generated_at", errors);
  assert(isNonEmptyString(report.run_id), "review/draft_qa_report.json: run_id is required", errors);
  if (report.run_id && runIds.size > 0) {
    assert(runIds.has(report.run_id), `review/draft_qa_report.json: unknown run_id ${report.run_id}`, errors);
  }

  const requiredChecks = [
    "glossary_violations",
    "citation_reference_format",
    "image_link_code_preservation",
    "duplicate_words",
    "impossible_references",
    "empty_targets",
    "addition_omission_scan",
  ];
  assert(report.checks && typeof report.checks === "object", "review/draft_qa_report.json: checks object is required", errors);
  for (const key of requiredChecks) {
    assert(isCheckTrue(report.checks, key), `review/draft_qa_report.json: checks.${key} must be true`, errors);
  }

  assert(Array.isArray(report.findings), "review/draft_qa_report.json: findings must be an array", errors);
  assert(Array.isArray(report.blocking_findings), "review/draft_qa_report.json: blocking_findings must be an array", errors);
  assert(
    !Array.isArray(report.blocking_findings) || report.blocking_findings.length === 0,
    "review/draft_qa_report.json: blocking_findings must be empty before pre-review/final export",
    errors
  );

  for (const [index, finding] of Array.isArray(report.findings) ? report.findings.entries() : []) {
    if (finding.target_id !== undefined) {
      assert(knownTargets.has(finding.target_id), `review/draft_qa_report.json: findings[${index}] points to unknown target ${finding.target_id}`, errors);
    }
    if (finding.severity !== undefined) {
      assert(VALID_SEVERITIES.includes(finding.severity), `review/draft_qa_report.json: findings[${index}] has invalid severity ${finding.severity}`, errors);
    }
  }

  warn(report.stats && typeof report.stats === "object", "review/draft_qa_report.json: stats object is recommended", warnings);
  return report;
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

export function validateImpactReports(projectDir, chunks, revisions, errors) {
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
