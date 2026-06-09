import path from "node:path";

import {
  EXPORTABLE_STATES,
  FINAL_EXPORT_BLOCKING_ISSUE_TYPES,
  MEDIUM_OR_HIGHER_SEVERITIES,
  VALID_REUSABLE_ASSET_TYPES,
  VALID_REUSABLE_IMPORT_STATUS,
} from "./constants.mjs";
import { translationTarget } from "./core-rules.mjs";
import {
  assert,
  dirExists,
  fileExists,
  isCheckTrue,
  isNonEmptyString,
  isPlainRelativePath,
  readJson,
  readText,
  validateMarkdownImageAssets,
} from "./io.mjs";

export function validateExport(projectDir, project, chunks, issues, translations, glossaryTerms, errors, warnings) {
  const exportDir = path.join(projectDir, "export");
  if (!dirExists(exportDir)) return;

  const manifestFile = path.join(exportDir, "export_manifest.json");
  const manifest = fileExists(manifestFile) ? readJson(manifestFile, errors) : null;

  const qaFile = path.join(exportDir, "export_qa_report.json");
  let qaReport = null;
  if (fileExists(qaFile)) {
    qaReport = readJson(qaFile, errors);
    if (qaReport && qaReport.ok === undefined) {
      warnings.push("export_qa_report.json: ok field is missing");
    }
  }

  const outputFile = path.join(exportDir, "output.md");
  if (!fileExists(outputFile)) return;
  validateMarkdownImageAssets(outputFile, "export/output.md", errors);

  const reviewFile = path.join(exportDir, "review.html");
  if (fileExists(reviewFile)) {
    const reviewHtml = readText(reviewFile);
    assert(
      reviewHtml.includes("translationstack-data"),
      "export/review.html: embedded translationstack-data is required",
      errors
    );
  }

  const draftExport = project.export_policy?.draft_export === true || qaReport?.draft_export === true;
  const chunkStateById = new Map(chunks.map(chunk => [chunk.id, chunk.state]));
  const exportedChunks = Array.isArray(manifest?.chunks) ? manifest.chunks : [];
  const exportedChunkIds = new Set(exportedChunks.map(chunk => chunk.id).filter(Boolean));

  assert(Array.isArray(manifest?.chunks), "export_manifest.json: chunks must be an array", errors);
  assert(exportedChunkIds.size > 0, "export_manifest.json: at least one exported chunk is required", errors);
  assert(Array.isArray(manifest?.reusable_assets), "export_manifest.json: reusable_assets must be an array", errors);

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

  for (const [index, asset] of Array.isArray(manifest?.reusable_assets) ? manifest.reusable_assets.entries() : []) {
    assert(VALID_REUSABLE_ASSET_TYPES.includes(asset.type), `export_manifest.json: reusable_assets[${index}] has invalid type ${asset.type}`, errors);
    assert(isNonEmptyString(asset.path), `export_manifest.json: reusable_assets[${index}].path is required`, errors);
    assert(
      VALID_REUSABLE_IMPORT_STATUS.includes(asset.import_status),
      `export_manifest.json: reusable_assets[${index}].import_status must be proposal or trusted_by_user`,
      errors
    );
    if (isPlainRelativePath(asset.path)) {
      assert(fileExists(path.join(projectDir, asset.path)), `export_manifest.json: reusable asset path does not exist: ${asset.path}`, errors);
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

  const mediumBlockingOpenIssues = issues.filter(issue =>
    issue.status === "open" &&
    MEDIUM_OR_HIGHER_SEVERITIES.includes(issue.severity) &&
    FINAL_EXPORT_BLOCKING_ISSUE_TYPES.includes(issue.type)
  );
  if (mediumBlockingOpenIssues.length > 0) {
    const message = `Final export exists with open medium+ blocking issues: ${mediumBlockingOpenIssues.map(issue => issue.id).join(", ")}`;
    if (draftExport) warnings.push(`${message} (allowed by draft_export)`);
    else errors.push(message);
  }

  if (qaReport?.ok === false || (Array.isArray(qaReport?.errors) && qaReport.errors.length > 0)) {
    const message = "Export QA report is not ok";
    if (draftExport) warnings.push(`${message} (allowed by draft_export)`);
    else errors.push(message);
  }

  const readinessStatement = qaReport?.publication_readiness_statement;
  if (!draftExport && !(typeof readinessStatement === "string" && readinessStatement.trim().length > 0)) {
    errors.push("export_qa_report.json: publication_readiness_statement is required for final export");
  }
  if (!draftExport) {
    assert(isCheckTrue(qaReport?.checks, "review_workbench_data_non_empty"), "export_qa_report.json: checks.review_workbench_data_non_empty must be true for final export", errors);
    assert(isCheckTrue(qaReport?.checks, "review_workbench_smoke_test"), "export_qa_report.json: checks.review_workbench_smoke_test must be true for final export", errors);
    assert(Array.isArray(qaReport?.reusable_assets), "export_qa_report.json: reusable_assets must be an array for final export", errors);
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
