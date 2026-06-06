# TranslationStack Contract

TranslationStack is a contract-first AI translation project protocol.

The agent may choose how to analyze, chunk, translate, review, revise, and export. The durable project assets must conform to this contract.

## MVP Source Scope

The MVP source format is clean Markdown.

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

If the source needs an out-of-scope format or conversion feature, stop and ask the user before continuing.

## Required Project Files

```text
.translationstack/<project-id>/
├── project.yaml
├── source/original.md
├── chunk_manifest.yaml
├── glossary/glossary.yaml
├── glossary/glossary_proposals.jsonl
├── style/style_guide.yaml
├── translations/chunks/*.jsonl
├── review/issues.jsonl
├── review/revisions.jsonl
├── memory/translation_memory.jsonl
├── export/review.html
├── export/output.md
├── export/export_manifest.json
├── export/export_qa_report.json
└── runs/*.json
```

The minimum pre-translation working set is:

- `project.yaml`
- `source/original.md`
- `chunk_manifest.yaml`
- `glossary/glossary.yaml`
- `style/style_guide.yaml`
- empty `review/issues.jsonl`
- empty `review/revisions.jsonl`

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

Agents must read `project.yaml` before making translation or revision decisions.

## Durable Truth

Durable truth is in files, not chat history.

- Chunk structure: `chunk_manifest.yaml`
- Terminology: `glossary/glossary.yaml`
- Style: `style/style_guide.yaml`
- Translation rows: `translations/chunks/*.jsonl`
- Review issues: `review/issues.jsonl`
- Revision history: `review/revisions.jsonl`
- Export QA: `export/export_qa_report.json`
- Local Markdown image assets: copied under the source/export directory that references them

## AI Output Boundary

The model may propose changes, but durable changes must land as project files and pass validation.

Global terminology and state-changing revisions should be recorded in `review/revisions.jsonl` before being applied.

## Non-Goals For MVP

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
