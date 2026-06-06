# Execution Modes

This skill currently targets Claude Code execution tools. Use this file to choose how each workflow node runs and what evidence must be written to disk.

## Tools

### Main Loop

Use the main loop for:

- user dialogue
- mode selection
- chunk boundary decisions
- terminology and style policy
- final merge decisions
- all writes to durable project files

### Sub-Agents

Use sub-agents for:

- AI pre-review
- independent audit lenses
- parallel translation of independent chunks when the project is large enough
- optional chunk-boundary review after the main loop drafts `chunk_manifest.yaml`

Sub-agent findings are advisory until the main loop merges them into project files.

### Workflow

Use Workflow only after user confirmation. Workflow mode is appropriate when the project needs project-level orchestration, parallel phases, resumability, or a hard token budget.

Workflow output is not durable truth by itself. The main loop must write accepted translations, issues, revisions, exports, and run records into the TranslationStack project files.

## Node Matrix

| Node | Tool |
|---|---|
| Project scaffold (steps 1-3) | main loop + Bash |
| Chunk manifest (4) | main loop; optional sub-agent boundary review |
| Pre-translation validator (5) | Bash |
| Glossary candidate extraction (6) | main loop for short documents; sub-agents for long or term-heavy documents |
| Term and style confirmation (7) | main loop user dialogue |
| Translation (8-9) | main loop for small projects; sub-agents for independent chunks; Workflow when confirmed |
| AI pre-review (10) | sub-agent fan-out |
| Render review.html (11) | script/template |
| Open review.html (12) | local browser command |
| Final validator (13) | Bash |
| Export (14) | script or main loop file assembly |

## Mode Selection

Choose a mode before translation starts:

- `main-loop`: default for small projects. The main loop translates sequentially; Step 10 still uses sub-agent review.
- `sub-agent`: use when translation chunks can be processed independently and merged safely.
- `workflow`: use only after user confirmation.

If useful, write a project default to `project.yaml`:

```yaml
execution:
  default_mode: sub-agent
```

Record the actual mode used in `runs/<run-id>.json`, not in `project.yaml`.

## When To Offer Workflow

After `chunk_manifest.yaml` exists and before translation starts, offer Workflow mode when at least two signals apply:

- many chunks
- long source
- complex terminology
- dense Markdown structure, links, images, code, or markers
- publication-grade expectations
- high-risk domain such as legal, medical, theological, or scripture-heavy text
- likely multi-session work
- requested token budget

Ask once. If the user declines, continue with `main-loop` or `sub-agent` mode and record the selected mode in the run file.

## Pre-Review Lenses

Step 10 must use sub-agent review lenses before issues are written. Pick lenses that match the project risk.

Common lenses:

- terminology consistency against confirmed glossary
- marker and Markdown structure preservation
- image, link, code fence, and inline marker preservation
- accuracy: omission, addition, mistranslation, or changed logic
- target-language readability
- cross-chunk consistency
- domain-specific precision

Merge and de-duplicate findings in the main loop before writing `review/issues.jsonl`. Preserve the lens name in each issue when it helps later review.

## Workflow Shape

When the user confirms Workflow mode, create a project-local workflow script. Use this shape:

1. Translation phase: fan out over chunks or batches; provide each worker the relevant source chunk, confirmed glossary, style guide, and necessary context.
2. Pre-review phase: run selected review lenses as schema-bound sub-agent outputs.
3. Optional verification phase: check proposed issues against source and target evidence before accepting them.
4. Merge phase: main loop writes accepted translations, issues, revisions, exports, and run evidence into project files.

Do not treat workflow intermediate files as final project state until the main loop has written the contract files and the validator passes.

## Run Evidence

Every run that uses sub-agents or Workflow must write `runs/<run-id>.json`.

Minimum fields:

- `run_id`
- `type`: `translate`, `pre_review`, `export`, or another clear run type
- `execution_mode`: `main-loop`, `sub-agent`, or `workflow`
- `tool_used`: `main-loop`, `Agent`, or `Workflow`
- `started_at`
- `ended_at`
- `inputs`: project files used by the run
- `outputs`: project files created or modified by the run
- `limitations`: skipped lenses, budget limits, reduced context, failed batches, or other coverage limits

For sub-agent runs, also include:

- `agents`: count plus each agent's role or lens
- `merge_decisions`: findings kept, merged, rejected, or deferred

For Workflow runs, also include:

- `workflow_script`: path and content hash
- `phases` or `batches`
- `errors`
- `retries`
- `verification_results`, when verification was used

## Rules

- Do not write sub-agent findings directly into durable files without main-loop merge.
- Do not fan out translation or review without a run record.
- Do not record actual runtime mode in `project.yaml`; use `runs/<run-id>.json`.
- Do not switch into Workflow mode mid-translation unless the user confirms the switch.
- Do not export until contract files are written and the validator result is reported.
