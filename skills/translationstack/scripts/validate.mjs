#!/usr/bin/env node

import path from "node:path";

import { VALID_PHASES } from "./validator/constants.mjs";
import {
  buildTargetStateMap,
  validateGlossary,
  validateIssues,
  validateManifest,
  validateMemoryAndAgentLog,
  validateProject,
  validateRequiredPaths,
  validateStyle,
  validateTranslationCoverage,
  validateTranslations,
} from "./validator/core-rules.mjs";
import {
  validateDraftQa,
  validateImpactReports,
  validateProjectBrief,
  validateRevisions,
  validateRuns,
} from "./validator/evidence-rules.mjs";
import { validateExport } from "./validator/export-rules.mjs";
import {
  assert,
  dirExists,
  validateMarkdownImageAssets,
} from "./validator/io.mjs";

function parseArgs(argv) {
  let phase = "final";
  let projectDir = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--phase") {
      phase = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--phase=")) {
      phase = arg.slice("--phase=".length);
      continue;
    }
    if (!projectDir) {
      projectDir = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!VALID_PHASES.includes(phase)) {
    throw new Error(`Invalid phase: ${phase}. Expected one of ${VALID_PHASES.join(", ")}`);
  }

  return { projectDir, phase };
}

function printUsageAndExit(message) {
  if (message) console.error(message);
  console.error("Usage: node skills/translationstack/scripts/validate.mjs [--phase pretranslate|translate|review|final] <project-dir>");
  process.exit(2);
}

function runValidation(projectDir, phase) {
  const resolvedProjectDir = path.resolve(projectDir);
  const errors = [];
  const warnings = [];

  assert(dirExists(resolvedProjectDir), `Project directory does not exist: ${resolvedProjectDir}`, errors);

  if (dirExists(resolvedProjectDir)) {
    validateRequiredPaths(resolvedProjectDir, phase, errors);
    validateMarkdownImageAssets(path.join(resolvedProjectDir, "source", "original.md"), "source/original.md", errors);

    const project = validateProject(resolvedProjectDir, errors, warnings);
    validateProjectBrief(resolvedProjectDir, phase, errors, warnings);

    const { chunks, chunkIds, segmentIds } = validateManifest(resolvedProjectDir, errors, warnings);
    const knownTargets = new Set([...chunkIds, ...segmentIds]);

    const glossaryTerms = validateGlossary(resolvedProjectDir, errors, warnings);
    validateStyle(resolvedProjectDir, errors, warnings);
    validateMemoryAndAgentLog(resolvedProjectDir, phase, errors, warnings);
    const issues = validateIssues(resolvedProjectDir, knownTargets, errors, warnings);
    const revisions = validateRevisions(resolvedProjectDir, knownTargets, errors, warnings);
    const { runIds } = validateRuns(resolvedProjectDir, phase, errors, warnings);

    const shouldValidateTranslations = ["translate", "review", "final"].includes(phase);
    const targetStates = buildTargetStateMap(chunks);
    const translations = shouldValidateTranslations
      ? validateTranslations(resolvedProjectDir, knownTargets, targetStates, runIds, errors, warnings)
      : [];
    if (shouldValidateTranslations) validateTranslationCoverage(chunks, translations, errors);

    validateDraftQa(resolvedProjectDir, phase, knownTargets, runIds, errors, warnings);
    validateImpactReports(resolvedProjectDir, chunks, revisions, errors);

    if (phase === "final") {
      validateExport(resolvedProjectDir, project, chunks, issues, translations, glossaryTerms, errors, warnings);
    }
  }

  return {
    ok: errors.length === 0,
    phase,
    projectDir: resolvedProjectDir,
    errors,
    warnings,
    stats: {
      errors: errors.length,
      warnings: warnings.length,
    },
  };
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    printUsageAndExit(error.message);
  }

  const { projectDir, phase } = parsed;
  if (!projectDir) printUsageAndExit();

  const report = runValidation(projectDir, phase);
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length > 0) process.exit(1);
}

main();
