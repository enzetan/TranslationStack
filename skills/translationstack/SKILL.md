---
name: translationstack
description: Use when translating, reviewing, revising, or exporting long Markdown documents as durable TranslationStack projects with glossary, style, review, revision, memory, and validation artifacts.
---

# TranslationStack

Use TranslationStack when the user asks to translate, review, revise, or export a long document as a durable AI translation project.

Write every durable translation result into the project contract files. Do not rely on chat history as the project record.

## Requirements

- Use Bun >= 1.x for scripts when available.
- From this repository checkout, run scripts with: `bun skills/translationstack/scripts/validate.mjs <project-dir>`.
- From a project-local Claude Code skill symlink, use: `bun .claude/skills/translationstack/scripts/validate.mjs <project-dir>`.
- If Bun is unavailable, use the same script path with the Node fallback: `node <script-path> <project-dir>`.
- Do not require `package.json`, `npm install`, or third-party runtime dependencies for normal use.

## Core Rule

Create semantic project assets instead of one-shot translation output.

Do not build or depend on a fixed runtime, SQLite database, CAT/TMS workflow, model provider wrapper, Agent SDK harness, DOCX/PDF parser, or heavyweight frontend. Use the files in this skill package as the protocol.

## Supported Source Scope

Use only clean Markdown as source input.

Allowed:

- headings
- paragraphs
- ordinary lists
- block quotes
- fenced code blocks
- Markdown image references with local image assets copied alongside the Markdown
- simple inline markers supplied by the agent

Unsupported source features:

- Pandoc Markdown extensions
- DOCX
- PDF
- EPUB
- LaTeX
- citation and bibliography processing
- complex tables
- document conversion

If the user provides an out-of-scope source such as EPUB, DOCX, PDF, or LaTeX, pause before project initialization. Tell the user that TranslationStack needs clean Markdown, and ask them to provide a cleaned Markdown source. Mention external tools such as `pandoc` only as a way the user can prepare Markdown before returning to this workflow.

Do not convert the file as part of the TranslationStack workflow, do not add parser or converter logic to this skill, and do not proceed until the Markdown has been inspected and accepted as clean supported source input.

## Project Layout

Create or reuse:

```text
.translationstack/<project-id>/
├── project.yaml
├── source/
│   └── original.md
├── chunk_manifest.yaml
├── project_brief.json
├── glossary/
│   ├── glossary.yaml
│   └── glossary_proposals.jsonl
├── style/
│   └── style_guide.yaml
├── translations/
│   └── chunks/
├── review/
│   ├── draft_qa_report.json
│   ├── issues.jsonl
│   └── revisions.jsonl
├── memory/
│   └── translation_memory.jsonl
├── export/
│   ├── review.html
│   ├── output.md
│   ├── export_manifest.json
│   └── export_qa_report.json
└── runs/
```

Read `project.yaml`, `chunk_manifest.yaml`, `glossary/glossary.yaml`, and `style/style_guide.yaml` before translating or revising.

## Workflow

When the user asks to translate a long document:

1. Initialize or locate `.translationstack/<project-id>/`.
2. Confirm the source is clean Markdown and copy it into `source/original.md`.
   - Copy local Markdown image assets referenced by `source/original.md` into `source/` at the same relative paths.
   - Do not proceed if source assets are missing; fix the source snapshot first.
3. Create or update `project.yaml`.
4. Analyze the source and create `chunk_manifest.yaml` with semantic chunks.
5. Run `bun skills/translationstack/scripts/validate.mjs --phase pretranslate <project-dir>` before translation; fix `planned`/coverage issues first.
6. Build whole-source understanding before full translation.
   - Inspect the full source, not only the first chunk.
   - Identify the source's main thesis or purpose, structure, argument/narrative flow, audience, genre, tone, recurring terms, motifs, references, domain assumptions, and translation risks.
   - For long sources, use a fan-out/fan-in pass: assign each sub-agent a source range or section, collect structured notes, and merge them into one durable source understanding.
   - Write the merged source understanding / project brief into `project_brief.json` before translating chunks. Include audience, purpose, genre, domain, risk, reference/citation policy when relevant, quality bar, and execution-mode signals.
   - Do not begin full translation until this brief exists. If the source is too long to inspect completely in one pass, record the coverage limit and inspect all remaining sections through sub-agents or follow-up passes before full translation.
7. Extract and aggregate glossary candidates into `glossary/glossary_proposals.jsonl`.
   - Aggregate case/plural/variant forms into concepts where applicable (for example `LLM`, `llm`, `LLMs`, `llms`).
   - Match imported or existing glossary entries when available.
8. Start the dev workbench for terminology and style confirmation on long, high-risk, publication-grade, or style-sensitive projects. For smaller low-risk projects, ask in chat and record the decision in project files.
   - Core terminology and style direction must be user-confirmed before full translation.
   - If the project is publication-grade, high-risk, long, or style-sensitive, do not rely on chat-only confirmation; present terms/style in the workbench or write a durable confirmation artifact.
9. Calibrate style with representative sample translations before the full run when style is non-trivial.
   - Pick passages that cover the document's real range: dense concepts or technical content, narrative or argument flow, examples/application, citation- or reference-heavy content, proper names/foreign-language phrases, tone shifts, and rhetorically important passages.
   - Offer distinct style variants when more than one target voice is plausible, then write accepted samples into `style/style_guide.yaml` and `memory/translation_memory.jsonl`.
10. Pick execution mode per batch before translation: `sub-agent` (default) or `dynamic-workflow`.
    - Translation and review always fan out. Main loop owns dialogue, term/style, batch dispatch, glossary sync, and final merge only.
    - A batch follows source semantics: one chapter = one batch; split a chapter only when it is too large for one fan-out.
    - At batch start, re-read the latest glossary (terms are decided up front and grow during the project; each batch must use the current set).
    - Pick `sub-agent` for the batch when its content translates independently and finishes in one session; pick `dynamic-workflow` when the batch needs project-level orchestration, multi-phase structure, or a hard token budget.
    - Sub-agents write Markdown, not JSONL. The default durable translation output is `translations/chunks/<chunk-id>.md`, or `translations/chunks/<chunk-id>.<segment-or-batch-id>.md` when a chunk is split for fan-out. A separate integration sub-agent or merge phase converts Markdown into the contract JSONL wrapper.
    - Sub-agents must not create or modify `runs/<run-id>.json` or `runs/*.json`. The main loop or merge/integration phase is the sole writer of run evidence because it has full batch context, schema context, and merge decisions.
    - To fire `sub-agent`: `Fan out M sub-agents across <chapter-or-batch-range>; each writes Markdown for its slice to translations/chunks/<chunk-id>.<slice-id>.md; a separate integration sub-agent converts Markdown → JSONL; main loop validates and writes translations/. Sub-agents MUST NOT write runs/*.json. Do NOT translate serially.`
    - To fire `dynamic-workflow`: `dynamic-workflow: (phases: understand → translate (Markdown per sub-agent) → integrate (Markdown → JSONL) → pre-review)`.
    - Record the batch's mode in `runs/<run-id>.json`. See `protocol/execution-modes.md` for the full node matrix and `protocol/file-write-prompt.md` for the sub-agent prompt templates.
11. Translate semantic chunks with the source understanding, confirmed glossary, and style guide in context. Use Markdown as the primary translation format:
    - For a single-slice chunk, write `translations/chunks/<chunk-id>.md`.
    - For fan-out slices, each sub-agent writes `translations/chunks/<chunk-id>.<slice-id>.md`; the merge/integration phase concatenates or normalizes those files into `translations/chunks/<chunk-id>.md`.
    - Treat the `.md` file as the human-readable translation source of truth for review, diffing, and failure recovery. If a sub-agent stops partway through, inspect the partial Markdown, identify the missing source range, and resume from the missing range instead of re-running completed work.
12. Save validator wrappers under `translations/chunks/<chunk-id>.jsonl`.
    - The JSONL wrapper preserves the validator contract: `chunk_id`/`segment_id`, `source`, `target`, `state`, `run_id`, `glossary_hash`, `style_hash`, markers, and issues.
    - The merge/integration phase derives JSONL from the Markdown output and cross-checks that JSONL `target` or `target_markdown` equals the corresponding `.md` content after the documented concatenation/normalization step.
    - Humans review the Markdown files first; JSONL is for validation, coverage, state, and export tooling.
13. Append to `runs/agent_log.jsonl` only when a concise timeline entry will help handoff: multi-session work, dynamic workflow batches, user decisions, blockers, retries, validation results, or a non-obvious next action. Do not duplicate details already captured in `runs/<run-id>.json`.
14. After each chunk, batch, review pass, or user correction, decide whether a reusable gotcha was found. If yes, append it to `memory/translation_memory.jsonl` with `type: "gotcha"` before continuing.
15. If sub-agent or dynamic workflow batches fail, record the failure, split the task smaller, retry safe segments, and mark only truly blocked segments/chunks as `blocked`.
16. Run draft QA before AI pre-review and write `review/draft_qa_report.json`: glossary violations, citation/reference format when relevant, image/link/code preservation, duplicate words, impossible references, empty targets, and obvious additions/omissions.
17. Create AI pre-review issues in `review/issues.jsonl`.
18. **Start the dev workbench** (long-lived, one server per project):
    ```bash
    bun skills/translationstack/scripts/serve.mjs <project-dir> [--open|--no-open]
    ```
    - Leave the server running in the background for the lifetime of the project. Reuse the same server across sessions and agents; do not kill it between turns.
    - Default bind is `127.0.0.1:7878` (loopback only; pass `--host 0.0.0.0` only when you intentionally want LAN access, which prints a warning).
    - On startup the server **auto-opens the browser** at the workbench URL (`--no-open` to skip). The URL is also printed to stdout for the user to click manually if the auto-open does not work (e.g. headless environment).
    - Re-invoking `serve.mjs` while a server is already listening on the same port is **idempotent**: it probes the running server, prints its URL, auto-opens the browser, and exits 0. It does not kill the existing server.
    - To stop the server: `kill -TERM <pid>` (the server prints its PID at startup). Do not stop casually — re-use across sessions.
    - The workbench itself has two modes:
      - **dev mode (default)**: the page fetches live data from `/api/data` and refreshes via SSE on file changes. Used during translation iteration.
      - **share mode (for static archive / offline hand-off only)**: bake a single self-contained `export/review.html`
        ```bash
        bun skills/translationstack/scripts/render-review.mjs <project-dir>
        ```
        Then open it with the platform command (`open` / `xdg-open` / `start`). Use share mode for self-contained handoff only; it does not provide live updates.
19. **Verify the workbench is healthy** — run the smoke test:
    ```bash
    bun skills/translationstack/scripts/check-dev.mjs <project-dir>
    ```
    Exit code `0` is required. This script does NOT spawn a server itself — if no server is running, it fails with a clear hint to start one. Do not declare the step complete on visual inspection alone; "page renders" is not the same as "data loads".
20. Run the phase-appropriate skill validator and report the result: `--phase translate` after translations, `--phase review` after draft QA/pre-review, and `--phase final` after export.
21. Export `export/output.md` only when export policy allows it, unless the user explicitly requests a draft export.
22. After final translation/revision, export reusable assets when the project created reusable decisions: confirmed glossary, style guide, accepted style samples, translation memory, and domain/project profile for the next project.

## Execution Modes

Pick the fan-out mode per batch before translation starts. See `protocol/execution-modes.md` for the full node matrix, the Markdown-then-integration data flow, and run-record fields.

Rules:

1. **Translation and review always fan out.** The main loop owns dialogue, term/style, batch dispatch, glossary sync, and final merge only. Sub-agent and dynamic-workflow output is advisory until the main loop merges it.
2. **A batch follows source semantics.** One chapter = one batch; split a chapter only when it is too large for one fan-out. At batch start, re-read the latest glossary.
3. **Run AI pre-review with sub-agent lenses.** AI pre-review must use independent lenses before issues are written to `review/issues.jsonl`.

Two fan-out modes:

- **sub-agent** (default) — fan out sub-agents across the batch's chapter or section; each writes Markdown for its slice; an integration sub-agent creates the final chunk Markdown and converts Markdown → JSONL; main loop validates and writes.
- **dynamic-workflow** — when the batch needs project-level orchestration, multi-phase structure, or a hard token budget. Prepend `dynamic-workflow:` to the prompt and list the batch's phases.

Offer `dynamic-workflow` when the batch has at least two of: many chunks in the batch, long source, complex terminology, dense Markdown/links/code, publication-grade expectations, high-risk domain, likely multi-session work, or a requested token budget. Ask once before the batch starts.

When the project needs a reusable execution default, record it in `project.yaml` under `execution.default_mode`. Record each actual run in that run's `runs/<run-id>.json`. `project.yaml` is policy; `runs/` is history.

Every batch that fans out must have one `runs/<run-id>.json` record with `execution_mode`, `inputs`, `outputs`, batch summary, merge decisions, errors, and limitations. The main loop or merge/integration phase writes that record after fan-in. Sub-agents must not create or modify run records. See `protocol/execution-modes.md` for the minimum schema.

## Must Pause And Ask

Pause before continuing when:

- A core term has multiple plausible translations.
- Global terminology is not confirmed.
- Style direction is unclear.
- Representative style samples are needed but not approved for a publication-grade or style-sensitive project.
- Whole-source understanding is missing, partial, or not written to durable project files.
- Chunk coverage or source anchors are uncertain.
- Source text is missing, corrupted, or likely OCR damaged.
- Local image/link assets referenced by the Markdown source are missing.
- Domain-sensitive terms are uncertain, including legal, medical, technical, theological, scripture-related, or other high-risk terminology.
- A global replacement affects many chunks.
- Final export would include `blocked`, `stale`, unreviewed chunks, unconfirmed core terms, or open medium+ issues in blocking categories such as terminology, citation/reference handling, source alignment, omission/addition, marker preservation, or readability.

## Automatic Work Is Allowed

You may automatically perform ordinary format cleanup, low-risk glossary proposals, chunk summaries, AI pre-review issues, local style polish, static HTML rendering, and export QA. Record all durable changes in project files.

## State Discipline

Use only these states:

```text
planned, pending, translated, reviewing, reviewed, stale, blocked, exported
```

Do not translate `planned` chunks until coverage is validated and state becomes `pending`.

When glossary, style, source, or context changes, run impact analysis first. Mark affected chunks as `stale`; do not silently rewrite confirmed global terms or old translations.

## Persistence Discipline

Never treat chat history as project memory. Record:

- Terminology in `glossary/glossary.yaml`.
- Style in `style/style_guide.yaml`.
- Whole-source understanding, coverage notes, and project brief decisions in `project_brief.json`.
- Translation rows in `translations/chunks/*.jsonl`.
- Draft QA in `review/draft_qa_report.json`.
- Issues in `review/issues.jsonl`.
- Patches and state changes in `review/revisions.jsonl`.
- Export checks in `export/export_qa_report.json`.
- Accepted style samples, user feedback principles, reusable preferences, and gotchas in `memory/translation_memory.jsonl`.
- Execution evidence for a specific run in `runs/<run-id>.json`.
- Handoff timeline entries in `runs/agent_log.jsonl` when work spans sessions, has blockers/retries, uses dynamic workflow batches, records user decisions, or leaves a non-obvious next action.

Write a gotcha when a lesson is likely to prevent future translation drift, not merely when a sentence was hard. Good gotchas include a trigger, the likely mistake, the required correction, and the source of the decision. Do not duplicate glossary entries as gotchas; use gotchas for process, structure, style, reference, or preservation risks.

Preserve user-created issues. Do not overwrite `review/issues.jsonl` in a way that erases user notes.

## Marker And Code Rules

Inline markers such as `{{m1}}...{{/m1}}` and `<x id="..."/>` are load-bearing. Preserve marker set, count, order, and balance in every translation.

Do not translate YAML/JSON keys, code fences, CLI flags, placeholder names, marker tokens, or structural configuration unless the user explicitly asks.

The bundled validator uses a small dependency-free YAML parser. Do not use YAML block scalars (`|` or `>`) in contract files such as `project.yaml`, `chunk_manifest.yaml`, `glossary.yaml`, or `style_guide.yaml`; write notes as quoted single-line strings or arrays instead.

Local Markdown image references are load-bearing. When copying `source/original.md`, also copy referenced local assets so paths resolve from `source/original.md`; when exporting Markdown, copy the same assets so paths resolve from `export/output.md`.

## Validation

After creating or changing project assets, run:

```bash
bun skills/translationstack/scripts/validate.mjs --phase final .translationstack/<project-id>
```

If Bun is unavailable, run:

```bash
node skills/translationstack/scripts/validate.mjs --phase final .translationstack/<project-id>
```

Treat validator errors as blockers. Warnings are allowed only when you clearly report them.
