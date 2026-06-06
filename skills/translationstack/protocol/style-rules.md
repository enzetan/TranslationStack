# Style Rules

Style is a durable project asset, not a vague prompt.

## File

Use `style/style_guide.yaml`.

```yaml
style:
  strategy: faithful_readable
  register: formal
  tone: reverent
  sentence_structure: moderate_long
  modernization: restrained
  theological_precision: high

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

## Samples

Use samples when style is subtle. Each sample should include:

- `source`
- `target`
- `note`

