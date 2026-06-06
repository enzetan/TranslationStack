# TranslationStack Implementation Notes

This is a public contributor memo. It intentionally avoids private source files, local machine paths, credentials, live test artifacts, and one-off debugging transcripts.

Read this when changing the skill package, protocol files, validator, review template, or future adapters.

## Current Public Shape

The public MVP is a skill-native protocol package:

```text
skills/translationstack/
├── SKILL.md
├── protocol/
├── scripts/validate.mjs
└── templates/review.html
```

The repository should stay easy to inspect and easy to run:

- no package install required for validation
- no model call inside the validator
- no hidden database as project truth
- no mandatory hosted service
- no complex runtime before the file contract is stable

## Build Principle

Use this split:

```text
agentic execution
  - analyze source
  - propose chunks
  - translate
  - review
  - revise
  - generate export files

deterministic contract
  - project layout
  - state machine
  - glossary and style files
  - review and revision logs
  - export QA
  - validation
```

The agent may choose the route. The files must satisfy the contract.

## Contributor Rules

### Keep The Contract Small

Do not add a new required file unless it protects a real workflow property:

- recoverability
- reviewability
- targeted revision
- export safety
- provenance

Nice-to-have metadata belongs in optional files until it proves necessary.

### Keep Runtime State Out Of The Truth Layer

Runtime caches, temporary task output, model traces, and local server state can exist, but they must not become canonical truth.

Canonical project truth belongs in:

- `project.yaml`
- `source/original.md`
- `chunk_manifest.yaml`
- `glossary/glossary.yaml`
- `style/style_guide.yaml`
- `translations/chunks/*.jsonl`
- `review/issues.jsonl`
- `review/revisions.jsonl`
- `memory/translation_memory.jsonl`
- `export/*`

### Prefer Semantic Chunks

TranslationStack should not drift into sentence-by-sentence machine translation.

Good chunking follows:

```text
complete meaning > fixed size
source anchor > string range
review target > invisible prompt context
```

### Treat Glossary Changes As Project Events

A confirmed term change is not just a prompt update. It should create an impact analysis and mark affected chunks as `stale` before revision.

### Treat Style As Data

Style decisions should be written to `style/style_guide.yaml`. A vague chat instruction is not enough for a long project.

### Preserve User Review Notes

Never overwrite `review/issues.jsonl` in a way that loses user-created issues. Append, resolve, or supersede; do not erase.

### Export Only After QA

Export is a checkpoint. Before writing final output, check:

- chunk coverage
- states
- unresolved high-severity issues
- confirmed terminology
- marker preservation
- empty translations
- export policy

If the user asks for a draft export, record that it is a draft and list the remaining risks.

## Validator Expectations

`skills/translationstack/scripts/validate.mjs` should remain:

- dependency-free
- runnable with Bun
- runnable with Node when possible
- read-only
- deterministic
- clear about errors versus warnings

Validator errors should block export. Warnings can pass only if they are reported.

## Marker Rules

Inline markers are load-bearing. They preserve formatting, links, placeholders, and other structures that must survive translation.

Every translation must preserve:

- marker names
- marker count
- marker order
- open/close balance

Do not relax marker checks to make a bad translation pass. Fix the source normalization, chunking, or translation instruction instead.

## Format Adapter Rules

Complex formats should enter through adapters after the Markdown contract is stable.

An adapter must say:

- what it preserves
- what it degrades
- what it drops
- how anchors are produced
- how export QA reports limitations

Do not let a format adapter redefine TranslationStack truth. DOCX, EPUB, PDF, and HTML are source/export surfaces; the durable translation project remains the `.translationstack/<project-id>/` directory.

## Public Documentation Rules

Public docs should avoid:

- private paths
- personal names
- credentials or environment variable values
- unpublished client material
- exact local test artifacts
- temporary benchmark claims
- stale package versions or star counts
- implementation war stories that cannot be verified from the repository

Public docs should emphasize:

- long-document translation as a durable project
- file-backed memory
- glossary and style consistency
- review anchors
- revision history
- impact analysis
- export QA

## Useful One-Line Positioning

English:

> TranslationStack turns AI translation from a one-shot prompt into a reviewable, resumable, and revisable project.

Chinese:

> TranslationStack 把 AI 长文档翻译从一次性输出，变成可审校、可恢复、可修订的项目。
