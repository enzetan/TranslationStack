# File-Write Translation Prompt

Use this prompt pattern when a batch fans out to sub-agents or when a sub-agent handles enough material that a single structured return risks stalling.

## Model

Translation output is Markdown first, JSONL second:

1. The translation sub-agent writes Markdown only.
2. The merge/integration phase combines Markdown slices into the final chunk Markdown.
3. The merge/integration phase writes JSONL as a validator wrapper.
4. The main loop validates, cross-checks, and writes run evidence.

Sub-agents must not create or modify `runs/<run-id>.json`, `runs/*.json`, `runs/agent_log.jsonl`, or final export files.

## Sub-Agent Prompt

```markdown
You are the translation sub-agent for {chunk_id} / {slice_id}.

INPUTS:
- Source: {source_path}, lines {start}-{end}
- Project brief: {project_brief_path}
- Glossary: {glossary_path}
- Style guide: {style_guide_path}

OUTPUT:
- Write translated Markdown to {output_md_path}

RULES:
1. Write Markdown, not JSON and not JSONL.
2. Preserve Markdown structure, footnote markers, image links, code fences, blockquotes, and hard line breaks.
3. Follow the confirmed glossary and style guide.
4. If you cannot finish the whole slice, write the completed Markdown and clearly report the last completed source line.
5. Do NOT create or modify runs/<run-id>.json, runs/*.json, runs/agent_log.jsonl, export files, or project metadata.

RETURN:
{ "slice_id": "{slice_id}", "output_md_path": "{output_md_path}", "source_lines_completed": "{start}-{last_completed}", "status": "completed|partial|blocked", "notes": "..." }
```

## Merge / Integration Prompt

```markdown
You are the merge/integration agent for {chunk_id}.

INPUTS:
- Markdown slice files:
  - {slice_1_md}
  - {slice_2_md}
- Source: {source_path}
- Glossary: {glossary_path}
- Style guide: {style_guide_path}

OUTPUTS:
- Final Markdown: translations/chunks/{chunk_id}.md
- JSONL wrapper: translations/chunks/{chunk_id}.jsonl

TASKS:
1. Read all Markdown slice files in source order.
2. Concatenate or normalize them into translations/chunks/{chunk_id}.md.
3. Build translations/chunks/{chunk_id}.jsonl with the required contract fields.
4. Ensure JSONL target or target_markdown equals the final Markdown content after documented normalization.
5. Return merge decisions, coverage notes, errors, retries, and limitations to the main loop.

DO NOT let translation sub-agents write run evidence. The main loop or merge/integration phase owns runs/<run-id>.json.
```

## Checks

Before declaring the batch complete:

- The final `.md` exists and is non-empty.
- The `.jsonl` exists and references known chunk/segment targets.
- The JSONL `target` or `target_markdown` matches the final `.md` content when the chunk has one wrapper row.
- For multi-row JSONL, the concatenated targets match the final `.md` content after documented normalization.
- `runs/<run-id>.json` is written only after fan-in.
