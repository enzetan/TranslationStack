# Building Effective Agents Demo

This is a complete, user-visible TranslationStack demo project. It mirrors the working project originally built at `.translationstack/building-effective-agents/`, but is placed under `examples/` so it can be browsed and committed as part of the public repository.

Source material: Anthropic's [Building effective agents](https://www.anthropic.com/research/building-effective-agents), published December 19, 2024.

## What To Inspect

- `project.yaml` - project identity, language pair, translation policy, review policy, export policy, and execution mode.
- `source/original.md` - clean Markdown source with local image assets in `source/assets/`.
- `chunk_manifest.yaml` - semantic chunk boundaries, source anchors, summaries, preservation rules, and states.
- `glossary/glossary.yaml` - confirmed terminology decisions.
- `style/style_guide.yaml` - translation register, preferences, anti-patterns, and examples.
- `translations/chunks/` - translated chunk JSONL files.
- `review/issues.jsonl` and `review/revisions.jsonl` - AI review findings and the durable revision trail.
- `runs/` - run records for translation, pre-review, and export.
- `export/output.md` - exported Chinese Markdown.
- `export/review.html` - static bilingual review page.
- `export/export_qa_report.json` - export validation evidence.

## Validate

From the repository root:

```bash
bun skills/translationstack/scripts/validate.mjs examples/building-effective-agents
```

Node fallback:

```bash
node skills/translationstack/scripts/validate.mjs examples/building-effective-agents
```

## Publication Note

This demo includes third-party article text and images for protocol demonstration. Before publishing the repository publicly, confirm that the source article and image assets may be redistributed in this form, or replace them with original sample content.

