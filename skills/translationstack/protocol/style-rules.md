# Style Rules

Record style as a durable project asset, not as a vague prompt.

## File

Use `style/style_guide.yaml`.

```yaml
style:
  strategy: faithful_readable
  register: formal
  tone: measured
  sentence_structure: moderate_long
  modernization: restrained
  domain_precision: high

preferences:
  prefer:
    - 保留论证链条
  avoid:
    - 公众号化表达
```

## Rules

- Ask the user before establishing style when the target voice is unclear.
- Record style decisions explicitly.
- Style changes after translation require impact analysis.
- Style changes usually affect whole chunks, not isolated words.
- Do not silently coerce an invalid style strategy to a default; report uncertainty.
- For publication-grade, literary, legal, technical, theological, or otherwise style-sensitive projects, calibrate style with representative sample translations before the full run.
- When multiple target voices are plausible, offer style variants for the same source passage and ask the user to choose, combine, or revise them.
- Store accepted samples in `style/style_guide.yaml` and, when reusable, in `memory/translation_memory.jsonl`.
- Store style gotchas in `memory/translation_memory.jsonl` when the project reveals a recurring failure mode that style samples alone will not prevent.

## Samples

Create samples when style is subtle. Each sample must include:

- `source`
- `target`
- `note`

Representative samples must cover the actual range of the document, not just the easiest paragraph. Prefer passages that stress terminology, syntax density, rhetoric, citations, warnings, comfort, and domain-specific voice.

## Gotchas

Use gotchas for reusable warnings such as:

- a source pattern that repeatedly invites a wrong translation
- a structure or marker that must be preserved differently from normal prose
- a user correction that changes future translation behavior
- a citation, scripture, endnote, verse, or dialogue convention that is easy to break

Do not use gotchas for one-off wording choices that belong only in the current translation row.
