# TranslationStack Contract

Use this contract as the durable boundary for every TranslationStack project.

Choose analysis, chunking, translation, review, revision, and export methods freely only when the resulting project assets conform to this contract.

## Supported Source Scope

The supported source format is clean Markdown.

Allowed structures:

- headings
- paragraphs
- ordinary lists
- block quotes
- fenced code blocks
- Markdown image references with local image assets copied alongside the Markdown
- simple inline markers supplied by the agent

Out of scope:

- Pandoc Markdown extensions
- DOCX/PDF/EPUB/LaTeX
- citation and bibliography processing
- complex table preservation
- document conversion

Only inspected clean Markdown may be copied into `source/original.md`. Do not create or update TranslationStack project files from an unsupported source format or from uninspected conversion output.

## Required Project Files

```text
.translationstack/<project-id>/
├── project.yaml
├── source/original.md
├── chunk_manifest.yaml
├── project_brief.json
├── glossary/glossary.yaml
├── glossary/glossary_proposals.jsonl
├── style/style_guide.yaml
├── translations/chunks/*.jsonl
├── review/draft_qa_report.json
├── review/issues.jsonl
├── review/revisions.jsonl
├── memory/translation_memory.jsonl
├── runs/agent_log.jsonl        # optional chronological process log
├── export/output.md             # final artifact
├── export/review.html           # share-mode baked artifact; see note
├── export/export_manifest.json
├── export/export_qa_report.json
└── runs/*.json
```

Write `export/review.html` only for **share mode / export-stage** handoff. During dev-mode review iteration, serve the workbench with `scripts/serve.mjs` and leave `export/review.html` absent until export-policy gates are met.

The minimum pre-translation working set is:

- `project.yaml`
- `source/original.md`
- `chunk_manifest.yaml`
- `glossary/glossary.yaml`
- `style/style_guide.yaml`
- empty `review/issues.jsonl`
- empty `review/revisions.jsonl`

Validator phases:

- `pretranslate`: project, source assets, chunk coverage, glossary, style, and empty review files.
- `translate`: `pretranslate` plus `project_brief.json`, glossary proposals, translation rows, memory, and run records.
- `review`: `translate` plus `review/draft_qa_report.json`.
- `final`: complete delivery, including export files, workbench evidence, reusable asset manifest, and final QA.

Contract YAML files must stay within the bundled validator's dependency-free YAML subset. Do not use block scalar syntax (`|` or `>`) in `project.yaml`, `chunk_manifest.yaml`, `glossary.yaml`, or `style_guide.yaml`; use quoted single-line strings or arrays for notes.

If `source/original.md` contains local Markdown image references, the referenced files must exist relative to `source/original.md`. If `export/output.md` contains local image references, the referenced files must exist relative to `export/output.md`.

The strict validator checks the full project contract, including translation, review, memory, export, and run artifacts. Use it after the agent has produced a complete TranslationStack project snapshot.

## Project Identity

`project.yaml` is the entry point. It must contain:

- `project.id`
- `project.name`
- `project.source_language`
- `project.target_language`
- `project.domain`
- `translation_policy`
- `review_policy`

Read `project.yaml` before making translation or revision decisions.

## Durable Truth

Durable truth is in files, not chat history.

- Chunk structure: `chunk_manifest.yaml`
- Whole-source understanding: `project_brief.json`
- Terminology: `glossary/glossary.yaml`
- Style: `style/style_guide.yaml`
- Translation rows: `translations/chunks/*.jsonl`
- Human-readable translation Markdown: `translations/chunks/*.md`
- Draft QA: `review/draft_qa_report.json`
- Review issues: `review/issues.jsonl`
- Revision history: `review/revisions.jsonl`
- Export QA: `export/export_qa_report.json`
- Reusable translation memory and gotchas: `memory/translation_memory.jsonl`
- Chronological process log: `runs/agent_log.jsonl`
- Local Markdown image assets: copied under the source/export directory that references them

## Required JSON Schemas

`project_brief.json` must include `generated_at`, `source.file`, `coverage.mode`, `coverage.source_ranges`, `audience`, `purpose`, `genre`, `tone`, `domain`, `thesis`, `structure`, `recurring_terms`, `risks`, `reference_policy`, `quality_bar`, and `execution_signals`.

`review/draft_qa_report.json` must include `ok`, `generated_at`, `run_id`, `checks`, `findings`, and `blocking_findings`. Before review/final phases, `ok` must be `true`, `blocking_findings` must be empty, and these checks must be `true`: `glossary_violations`, `citation_reference_format`, `image_link_code_preservation`, `duplicate_words`, `impossible_references`, `empty_targets`, and `addition_omission_scan`.

Each `runs/<run-id>.json` is the evidence record for one execution unit. It must include `run_id`, `type`, `execution_mode`, `started_at`, `ended_at`, `inputs`, `outputs`, and `limitations`. Use `execution_mode: "sub-agent"` for normal sub-agent fan-out, or `execution_mode: "dynamic-workflow"` for dynamic workflow orchestration. Runs that use sub-agents must include `agents` and `merge_decisions`, but sub-agents must not create or modify `runs/<run-id>.json`, `runs/*.json`, or `runs/agent_log.jsonl`; the main loop or merge/integration phase writes run evidence after fan-in. Dynamic workflow runs must include `workflow_script`, `phases` or `batches`, `errors`, and `retries`.

Each `memory/translation_memory.jsonl` entry that records a gotcha must include `type: "gotcha"`, `id`, `scope`, `trigger`, `risk`, `guidance`, `evidence`, `created_at`, and `status`. Use `status: "active"` unless the gotcha has been superseded.

Each `runs/agent_log.jsonl` entry is a handoff timeline item that points to run evidence when relevant. Write it for cross-session continuity, blockers, retries, user decisions, validation results, dynamic workflow batch boundaries, and non-obvious next actions. Do not copy run evidence into the log. Each entry must include `type: "agent_log"`, `timestamp`, `run_id`, `phase`, `scope`, `event`, `result`, `next_action`, and `files_touched`. Keep log entries concise and factual.

Final `export/export_manifest.json` must include `chunks` and `reusable_assets`. Each reusable asset needs `type`, `path`, and `import_status` (`proposal` or `trusted_by_user`).

Final `export/export_qa_report.json` must include `publication_readiness_statement`, `checks.review_workbench_data_non_empty`, `checks.review_workbench_smoke_test`, and `reusable_assets`.

## Translation Output Pairing

For each translated chunk, write Markdown first and JSONL second:

- `translations/chunks/<chunk-id>.md` is the human-readable translation source of truth.
- `translations/chunks/<chunk-id>.jsonl` is the validator wrapper used for coverage, state, run linkage, and export tooling.
- For fan-out work, sub-agents may write slice Markdown such as `translations/chunks/<chunk-id>.<slice-id>.md`; the merge/integration phase writes the final chunk Markdown and JSONL wrapper.
- The JSONL row's `target` or `target_markdown` should match the corresponding Markdown content after documented concatenation or normalization.

## AI Output Boundary

You may propose changes, but durable changes must land as project files and pass validation.

Record global terminology changes and state-changing revisions in `review/revisions.jsonl` before applying them.

## Do Not Implement

Do not implement or require:

- fixed translation pipeline runtime
- CLI workflow runner
- SQLite
- Agent SDK wrapper
- DOCX/PDF/EPUB parser
- Pandoc runtime or Pandoc AST dependency
- CAT/TMS operations
- BLEU/COMET/TTE quality metrics
- model fine-tuning
- complex frontend
