# TranslationStack

Long-form translation should be a project, not a prompt.

TranslationStack is a contract-first AI translation protocol for books, essays, manuals, and other documents where consistency matters. It gives an AI agent a durable project structure: source anchors, semantic chunks, glossary rules, style memory, review issues, revision history, validation checks, and a static review page.

The agent still does the translation work. TranslationStack defines what must be remembered, reviewed, and validated so the work can be resumed, audited, revised, and shared.

## Why It Exists

Modern models can translate a paragraph well. The hard part starts when the document is long:

- the same term must stay consistent across chapters
- style decisions must survive beyond one chat session
- reviewer comments need stable targets
- glossary changes should update only the affected passages
- exported files should be checked before delivery

TranslationStack turns those concerns into files on disk instead of leaving them in chat history.

## What It Is

```text
TranslationStack
├── Skill          # agent behavior contract
├── Protocol       # project files, states, glossary, style, review, export rules
├── Validator      # dependency-free contract checks
└── Review HTML    # static bilingual review template
```

It is local-first, file-backed, and agent-friendly. It can be used from agent harnesses such as Claude Code or Codex, or inspected directly as ordinary Markdown, YAML, JSON, and JSONL files.

## MVP Scope

The current MVP intentionally supports clean Markdown only:

- headings
- paragraphs
- ordinary lists
- block quotes
- fenced code blocks
- simple inline markers supplied by the agent

DOCX, PDF, EPUB, Pandoc extensions, citation processors, bibliography tooling, and complex document conversion are out of scope for the MVP. Those formats can be added later as adapters after the project contract is stable.

## Repository Layout

- `skills/translationstack/` - loadable TranslationStack skill package
- `skills/translationstack/SKILL.md` - agent behavior contract
- `skills/translationstack/protocol/` - project contract and workflow rules
- `skills/translationstack/scripts/validate.mjs` - dependency-free contract validator
- `skills/translationstack/templates/review.html` - static review template
- `docs/` - public design, research, and implementation notes
- `examples/` - user-visible demo TranslationStack projects

## Project Shape

A TranslationStack project is written under `.translationstack/<project-id>/`:

```text
.translationstack/<project-id>/
├── project.yaml
├── source/original.md
├── chunk_manifest.yaml
├── glossary/glossary.yaml
├── glossary/glossary_proposals.jsonl
├── style/style_guide.yaml
├── translations/chunks/
├── review/issues.jsonl
├── review/revisions.jsonl
├── memory/translation_memory.jsonl
├── export/review.html
├── export/output.md
├── export/export_manifest.json
└── export/export_qa_report.json
```

The files are the source of truth. Chat is only the working interface.

## Validate A Project

Preferred runner:

```bash
bun skills/translationstack/scripts/validate.mjs .translationstack/<project-id>
```

Node fallback:

```bash
node skills/translationstack/scripts/validate.mjs .translationstack/<project-id>
```

When the skill is linked as a project-local skill, the same validator can be run through the linked path:

```bash
bun .claude/skills/translationstack/scripts/validate.mjs .translationstack/<project-id>
bun .codex/skills/translationstack/scripts/validate.mjs .translationstack/<project-id>
```

The validator checks the contract only. It does not translate, call a model, mutate project files, or require `package.json` / `npm install`.

## Documentation

- [Documentation Index](docs/README.md)
- [Design](docs/design/FINAL_DESIGN.md)
- [DOCX and Competitor Research](docs/research/DOCX-AND-COMPETITORS.zh.md)
- [Implementation Notes](docs/archive/BUILDING_TRANSLATESTACK.md)

## Examples

- [Building Effective Agents demo](examples/building-effective-agents/) - a complete English-to-Simplified-Chinese TranslationStack project with source, chunks, glossary, review issues, revision history, run records, and exported output.

## Non-Goals

TranslationStack is not a CAT/TMS, translation API wrapper, model provider, fixed agent runtime, document parser, or layout-preserving DOCX/PDF engine.

Its job is narrower and more durable: define the project contract that lets AI translation behave like professional translation work.
