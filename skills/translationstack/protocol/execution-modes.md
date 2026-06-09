# Execution Modes

TranslationStack uses Claude Code execution tools to fan out translation work, and writes the required evidence to disk. The main loop never translates; it owns dialogue, term/style decisions, batch dispatch, glossary sync, and final merge.

## Roles vs Modes

- **Main loop role** (always present): dialogue, term/style decisions, batch dispatch, glossary sync, final merge. Not a translation mode.
- **Fan-out modes** (picked per batch): `sub-agent` (default) or `ultracode`.
- **Translation and review always fan out.** Main loop is never a translation mode.

## Tools

### Sub-Agents (default fan-out)

Use the Agent tool for:

- whole-source understanding by assigned section or source range
- AI pre-review
- independent audit lenses
- parallel translation of slices within a batch
- chunk-boundary review after the main loop drafts `chunk_manifest.yaml`
- glossary candidate extraction and concept aggregation
- representative sample selection and style-variant drafting
- failed-batch diagnosis and retry planning
- **integration sub-agent**: convert Markdown slices from translation sub-agents into the contract JSONL

Sub-agent output is advisory until the main loop merges it.

### Ultracode (dynamic workflow, user-confirmed)

Use Claude Code ultracode mode when the batch needs project-level orchestration, multi-phase structure, or a hard token budget. Use the `ultracode:` keyword. If the build does not yet have `ultracode`, fall back to the `workflow:` keyword.

Do not treat ultracode output as durable truth by itself. The main loop must write accepted translations, issues, revisions, exports, and run records into TranslationStack project files.

## Data Flow

Every translation batch follows this flow:

1. **Main loop** re-reads the latest glossary and project brief, and passes them to every sub-agent in the batch.
2. **Fan-out sub-agents** each write **Markdown** for their slice (not JSONL — translation prose is more reliable in Markdown and easier for humans to review).
3. **Integration sub-agent** combines the Markdown slices into `translations/chunks/<chunk-id>.md`, then converts that Markdown into the contract JSONL matching `validator/core-rules.mjs` schema.
4. **Main loop** validates against the project contract, runs draft QA, and keeps both `translations/chunks/<chunk-id>.md` and `translations/chunks/<chunk-id>.jsonl`.
5. **Pre-review lenses** (sub-agents) write findings to `review/issues.jsonl`; main loop merges and de-duplicates.

## Node Matrix

| Node | Tool |
|---|---|
| Project scaffold | main loop + Bash |
| Chunk manifest | main loop; add sub-agent boundary review when source structure is complex or boundary risk is high |
| Pre-translation validator | Bash |
| Source understanding / project brief | fan out assigned sections/ranges to sub-agents for long, dense, or high-risk sources; main loop fans in and writes the merged brief |
| Glossary candidate extraction and aggregation | main loop for short documents; sub-agents for long or term-heavy documents |
| Term and style confirmation | main loop user dialogue; use dev workbench or durable HTML artifact for long, high-risk, publication-grade, or style-sensitive projects |
| Representative style samples | main loop decision; sub-agents draft variants when multiple target voices are plausible |
| Batch translation (per chapter/batch) | sub-agent fan-out (slice Markdown) → integration sub-agent (final Markdown + JSONL wrapper) → main loop validates and keeps both files |
| Batch pre-review | sub-agent lenses → main loop merges to `review/issues.jsonl` |
| Draft QA before pre-review | script or main loop checks |
| Open review workbench — dev mode (long-lived) | `bun skills/translationstack/scripts/serve.mjs <project-dir>` (background); URL + PID printed to stdout; auto-opens browser; idempotent on re-invoke; **do not kill between sessions** |
| Open review workbench — share mode (static bake) | `bun skills/translationstack/scripts/render-review.mjs <project-dir>` writes `export/review.html` (no live updates) |
| Verify workbench | `bun skills/translationstack/scripts/check-dev.mjs <project-dir>`; pure probe, does NOT spawn a server; exit 0 required |
| Final validator | Bash |
| Export | script or main loop file assembly |

## Mode Selection

Pick the fan-out mode per batch before the batch starts:

- **sub-agent** (default): when the batch's content translates independently and the batch finishes in one session.
- **ultracode**: when the batch needs project-level orchestration, multi-phase structure, or a hard token budget. The main loop must offer it and the user must confirm.

When the project needs a reusable execution default, write it to `project.yaml`:

```yaml
execution:
  default_mode: sub-agent
```

Record the actual mode used in `runs/<run-id>.json`, not in `project.yaml`.

## When To Offer Ultracode

After `chunk_manifest.yaml` exists and before the batch starts, offer ultracode when at least two of these signals apply:

- many chunks in the batch
- long source
- complex terminology
- dense Markdown structure, links, images, code, or markers
- publication-grade expectations
- high-risk domain such as legal, medical, technical, theological, scripture-heavy, or otherwise domain-sensitive text
- likely multi-session work
- requested token budget

Ask once per batch. If the user declines, continue with `sub-agent` mode and record the selected mode in the run file.

## Pre-Review Lenses

AI pre-review must use sub-agent review lenses before issues are written. Pick lenses that match the project risk.

Common lenses:

- terminology consistency against confirmed glossary
- marker and Markdown structure preservation
- image, link, code fence, and inline marker preservation
- accuracy: omission, addition, mistranslation, or changed logic
- target-language readability
- source alignment
- citation/reference policy conformance, including scripture policy when applicable
- rhetorical force and target-audience fit when style matters
- cross-chunk consistency — reads previous batches' translations to catch carry-over drift
- domain-specific precision

Merge and de-duplicate findings in the main loop before writing `review/issues.jsonl`. Preserve the lens name in each issue when the lens affects later review or revision decisions.

## Ultracode Shape

When the user confirms ultracode mode, the workflow script runs these phases per batch:

1. **Source-understanding phase**: fan out assigned source sections/ranges; each worker returns structured notes on thesis/purpose, structure, tone, terminology, motifs, references, risks, and local translation implications.
2. **Brief merge phase**: main loop fans in notes, resolves contradictions, records coverage limits, and writes one durable source understanding / project brief before full translation.
3. **Translation phase**: fan out over chunks or batches; each sub-agent writes Markdown only to `translations/chunks/<chunk-id>.<slice-id>.md` or another project-local temporary Markdown path assigned by the main loop. The merge/integration phase creates the final `translations/chunks/<chunk-id>.md` and converts Markdown → JSONL.
4. **Checkpoint phase**: the main loop or workflow checkpoint phase writes batch progress, failures, retries, and limitations to `runs/<run-id>.json` or project-local workflow state.
5. **Retry phase**: split failed or sensitive batches into smaller semantic segments; continue unaffected batches.
6. **Pre-review phase**: run selected review lenses as schema-bound sub-agent outputs.
7. **Optional verification phase**: check proposed issues against source and target evidence before accepting them.
8. **Merge phase**: main loop writes accepted translations, issues, revisions, exports, and run evidence into project files.

Do not treat workflow intermediate files as final project state until the main loop has written the contract files and the validator passes.

## Run Evidence

Every run that uses sub-agents or ultracode must have one `runs/<run-id>.json` record.

Sub-agents must not create or modify `runs/<run-id>.json`, `runs/*.json`, or `runs/agent_log.jsonl`. They return or write their assigned Markdown/temporary output only. The main loop or merge/integration phase writes run evidence after fan-in because only that layer has complete schema context, batch status, merge decisions, errors, retries, and limitations.

## Markdown + JSONL Output

The default translation output pattern is Markdown first, JSONL wrapper second:

1. Sub-agents write translated Markdown for their assigned slice.
2. The merge/integration phase combines slice Markdown into `translations/chunks/<chunk-id>.md`.
3. The merge/integration phase writes `translations/chunks/<chunk-id>.jsonl` as the validator wrapper.
4. The main loop verifies the Markdown file is non-empty and that the JSONL target text matches the Markdown content after any documented normalization.

Use Markdown for human review, line diffs, and failure recovery. Use JSONL for validation, target coverage, state, run linkage, and export tooling.

Use `runs/<run-id>.json` for detailed evidence about one execution unit. Use `runs/agent_log.jsonl` only as a lightweight handoff timeline across execution units.

Minimum fields:

- `run_id`
- `type`: `source_understanding`, `translate`, `draft_qa`, `pre_review`, `review`, `export`, `workflow`, or another clear run type if the validator has been updated for it
- `execution_mode`: `sub-agent` or `ultracode`
- `tool_used`: `Agent` or `Workflow`
- `started_at`
- `ended_at`
- `inputs`: project files used by the run (include `from_run` references for cross-batch handoff)
- `outputs`: project files created or modified by the run
- `limitations`: skipped lenses, budget limits, reduced context, failed batches, or other coverage limits

For runs that used sub-agents, the main loop or merge/integration phase must also include:

- `agents`: count plus each agent's role or lens
- `merge_decisions`: findings kept, merged, rejected, or deferred

For ultracode runs, also include:

- `workflow_script`: path and content hash
- `phases` or `batches`
- `errors`
- `retries`
- `checkpoint_state`, when the run can be resumed
- `verification_results`, when verification was used

## Agent Log

Append `runs/agent_log.jsonl` when a future agent needs a quick timeline before opening detailed run records:

- a multi-session handoff
- a user decision that changes next steps
- a batch boundary (start or end of a chapter/batch) — for cross-batch handoff
- a blocker, retry, or partial failure
- a validation result that controls whether work can continue
- an ultracode batch boundary
- a non-obvious next action

Each entry should point to the relevant `run_id` and list touched files. Do not repeat full inputs, outputs, agent reports, merge decisions, errors, retries, or limitations that already belong in `runs/<run-id>.json`.

## Rules

- Translation and review always fan out. The main loop owns dialogue, term/style, batch dispatch, glossary sync, and final merge only.
- Do not write sub-agent output directly into durable files without main-loop merge.
- Do not let sub-agents create or modify `runs/*.json` or `runs/agent_log.jsonl`; run evidence is written only after fan-in by the main loop or merge/integration phase.
- Do not fan out translation or review without a run record.
- Do not use `agent_log.jsonl` as a substitute for `runs/<run-id>.json`.
- Do not write agent log entries for routine single-step edits unless they affect handoff or next action.
- Do not begin full translation until whole-source understanding has been merged and recorded.
- Do not record actual runtime mode in `project.yaml`; use `runs/<run-id>.json`.
- Do not switch into ultracode mode mid-translation unless the user confirms the switch.
- Do not export until contract files are written and the validator result is reported.
- Do not let one failed sub-agent batch halt the whole project when unaffected chunks can continue; split, retry, or mark only the affected unit as `blocked`.
