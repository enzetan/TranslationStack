# Chunking Rules

TranslationStack uses large semantic chunks for translation and smaller optional segments for review anchors.

For MVP, assume clean Markdown source. Do not design chunking around Pandoc-specific blocks, DOCX layout, PDF extraction, or EPUB spine structure.

## Principle

```text
complete meaning > fixed length
chapter structure > token count
argument continuity > parallelism
local revision > sentence-level MT
```

## Required Chunk Fields

Every chunk in `chunk_manifest.yaml` must include:

- `id`
- `title`
- `source_anchor`
- `source_summary`
- `chunk_type`
- `semantic_role`
- `state`
- `coverage.start`
- `coverage.end`
- `coverage.confidence`

`must_preserve` should list source features that need extra care.

## Stable IDs

Chunk IDs must be stable and human-readable:

```text
c01.intro
c01.argument
c02.section1
appendix.notes
```

Use only letters, numbers, `.`, `_`, and `-`. IDs must start with a letter.

## Good Chunks

Prefer:

- a full short article
- a heading with its body
- a complete argument unit
- a table with explanation
- a quote with its commentary
- a footnote with the nearest relevant paragraph
- a narrative scene

Avoid:

- sentence-by-sentence translation
- arbitrary token windows
- splitting titles from bodies
- splitting definitions from explanations
- splitting scripture references from their discussion
- splitting tables from surrounding context

## Segments

Segments are optional review anchors. Use them for:

- issue targets
- local revision targets
- HTML highlighting
- translation memory

When segments exist, segment IDs must start with the parent chunk ID and a colon, for example `c01.intro:s1`.
