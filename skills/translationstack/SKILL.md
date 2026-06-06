---
name: translationstack
description: Use when translating, reviewing, revising, or exporting long Markdown documents as durable TranslationStack projects with glossary, style, review, revision, memory, and validation artifacts.
---

# TranslationStack

Use TranslationStack when the user asks to translate, review, revise, or export a long document as a durable AI translation project.

TranslationStack is contract-first. You do the work as an agent, but every durable result must be written into the project contract files.

## Requirements

- Bun >= 1.x is the preferred script runner.
- From this repository checkout, run scripts with: `bun skills/translationstack/scripts/validate.mjs <project-dir>`.
- From a project-local Claude Code skill symlink, use: `bun .claude/skills/translationstack/scripts/validate.mjs <project-dir>`.
- If Bun is unavailable, use the same script path with the Node fallback: `node <script-path> <project-dir>`.
- Do not require `package.json`, `npm install`, or third-party runtime dependencies for normal use.

## Core Rule

Prefer semantic project assets over one-shot translation output.

Do not build or depend on a fixed runtime, SQLite database, CAT/TMS workflow, model provider wrapper, Agent SDK harness, DOCX/PDF parser, or heavyweight frontend. Use the files in this skill package as the protocol.

## MVP Source Scope

For the current MVP, only use clean Markdown as source input.

Allowed:

- headings
- paragraphs
- ordinary lists
- block quotes
- fenced code blocks
- Markdown image references with local image assets copied alongside the Markdown
- simple inline markers supplied by the agent

Out of scope for MVP:

- Pandoc Markdown extensions
- DOCX
- PDF
- EPUB
- LaTeX
- citation and bibliography processing
- complex tables
- document conversion

If a source document needs these features, stop and tell the user it is outside the current MVP scope. Do not silently invent a parser or conversion workflow.

## Project Layout

Create or reuse:

```text
.translationstack/<project-id>/
├── project.yaml
├── source/
│   └── original.md
├── chunk_manifest.yaml
├── glossary/
│   ├── glossary.yaml
│   └── glossary_proposals.jsonl
├── style/
│   └── style_guide.yaml
├── translations/
│   └── chunks/
├── review/
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
3. Create or update `project.yaml`.
4. Analyze the source and create `chunk_manifest.yaml` with semantic chunks.
5. Run the validator before translation; fix `planned`/coverage issues first.
6. Extract glossary candidates into `glossary/glossary_proposals.jsonl`.
7. Ask the user to confirm core terms and style direction.
8. Translate semantic chunks, not isolated sentences.
9. Save translations under `translations/chunks/<chunk-id>.jsonl`.
10. Create AI pre-review issues in `review/issues.jsonl`.
11. **Start the dev workbench** (long-lived, one server per project):
    ```bash
    bun skills/translationstack/scripts/serve.mjs <project-dir> [--open|--no-open]
    ```
    - The server is designed to be left running in the background for the lifetime of the project. Multiple sessions and agents can hit the same server — do not kill it between turns.
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
        Then open it with the platform command (`open` / `xdg-open` / `start`). This produces a file the user can hand off without a server, but it loses live updates.
12. **Verify the workbench is healthy** — run the smoke test:
    ```bash
    bun skills/translationstack/scripts/check-dev.mjs <project-dir>
    ```
    Exit code `0` is required. This script does NOT spawn a server itself — if no server is running, it fails with a clear hint to start one. Do not declare the step complete on visual inspection alone; "page renders" is not the same as "data loads".
13. Run the skill validator and report the result.
14. Export `export/output.md` only when export policy allows it, unless the user explicitly requests a draft export.

## Execution Modes

Choose how to run the workflow above for this project. This skill currently targets Claude Code execution tools. See `protocol/execution-modes.md` for the adaptation matrix, workflow shape, and run record schema.

Rules:

1. **Keep global decisions in the main loop.** Chunking, terminology, style direction, user dialogue, and mode selection stay with the main agent. Sub-agents may advise; the main agent decides.
2. **Run Step 10 with sub-agents.** AI pre-review must use independent sub-agent lenses before issues are written to `review/issues.jsonl`.

Three modes:

- **main-loop** (default) — run every step sequentially; pre-review still fans out sub-agents.
- **sub-agent** — handle global decisions in the main loop; run translation and pre-review in parallel sub-agents.
- **workflow** (user-confirmed) — write a project-local workflow script that orchestrates translation, pre-review, and run evidence.

After step 4 (`chunk_manifest.yaml`), decide whether workflow mode should be offered. Offer workflow mode when the project has at least two of these signals: many chunks, long source, complex terminology, dense structure, publication-grade expectations, high-risk domain, likely multi-session work, or a requested token budget. Ask once before translation starts. Continue in `main-loop` or `sub-agent` mode if the user declines.

Record the project-level default in `project.yaml` under `execution.default_mode` if useful; record each actual run in that run's `runs/<run-id>.json`. `project.yaml` is policy; `runs/` is history.

Every run that uses sub-agents or the Workflow tool must write a `runs/<run-id>.json` record with `execution_mode`, `tool_used`, `inputs`, `outputs`, lens/batch summary, merge decisions, errors, and limitations. See `protocol/execution-modes.md` for the minimum schema.

## Must Pause And Ask

Pause before continuing when:

- A core term has multiple plausible translations.
- Global terminology is not confirmed.
- Style direction is unclear.
- Chunk coverage or source anchors are uncertain.
- Source text is missing, corrupted, or likely OCR damaged.
- Scripture, legal, medical, theological, or other high-risk terms are uncertain.
- A global replacement affects many chunks.
- Export would include `blocked`, `stale`, or high-severity open issues.

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
- Translation rows in `translations/chunks/*.jsonl`.
- Issues in `review/issues.jsonl`.
- Patches and state changes in `review/revisions.jsonl`.
- Export checks in `export/export_qa_report.json`.

Preserve user-created issues. Do not overwrite `review/issues.jsonl` in a way that erases user notes.

## Marker And Code Rules

Inline markers such as `{{m1}}...{{/m1}}` and `<x id="..."/>` are load-bearing. Preserve marker set, count, order, and balance in every translation.

Do not translate YAML/JSON keys, code fences, CLI flags, placeholder names, marker tokens, or structural configuration unless the user explicitly asks.

The bundled validator uses a small dependency-free YAML parser. Do not use YAML block scalars (`|` or `>`) in contract files such as `project.yaml`, `chunk_manifest.yaml`, `glossary.yaml`, or `style_guide.yaml`; write notes as quoted single-line strings or arrays instead.

Local Markdown image references are load-bearing. When copying `source/original.md`, also copy referenced local assets so paths resolve from `source/original.md`; when exporting Markdown, copy the same assets so paths resolve from `export/output.md`.

## Validation

After creating or changing project assets, run:

```bash
bun skills/translationstack/scripts/validate.mjs .translationstack/<project-id>
```

If Bun is unavailable, run:

```bash
node skills/translationstack/scripts/validate.mjs .translationstack/<project-id>
```

Treat validator errors as blockers. Warnings are allowed only when you clearly report them.
