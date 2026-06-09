# Glossary Rules

Use glossary entries as project-level translation rules.

## File

Use `glossary/glossary.yaml`.

```yaml
terms:
  - source: grace
    target: 恩典
    status: confirmed
    scope: global
    origin: user
    note: 神学术语，避免译为恩惠、恩宠。
```

## Statuses

Use:

- `confirmed`
- `proposed`
- `rejected`

## Rules

- Confirmed terms must be followed.
- Proposed terms cannot be applied globally without user confirmation.
- Rejected terms must not be reintroduced as defaults.
- Global term changes require an impact report before applying revisions.
- Each important term must include a `note` that explains context.
- For long, domain-heavy, or publication-grade projects, present glossary candidates in the review workbench or another durable HTML confirmation artifact, not only in chat.
- Aggregate variants that clearly belong to the same concept, including case, plural, punctuation, spelling, and abbreviation variants where safe.
- External glossary imports are allowed, but imported terms start as `proposed` unless the user explicitly confirms them.
- Before final export, run a glossary violation check against confirmed terms and record unresolved violations as review issues.

## Concept Aggregation

Use concept grouping when a source term appears in variants:

```yaml
terms:
  - source: LLM
    target: 大语言模型
    status: confirmed
    scope: global
    origin: user
    note: "Variants: llm, LLMs, llms. Use 大语言模型 for the concept; use plural wording only when Chinese context requires it."
```

Do not over-merge terms with different technical meanings. If in doubt, keep separate proposals and ask the user.

## Impact

When a confirmed term is added, changed, deleted, or rejected after use:

1. Create an impact report in `review/impact-*.json`.
2. Ask before global propagation when many chunks are affected.
3. Mark affected chunks as `stale`.
4. Revise stale chunks only after confirmation.

## Reuse

After final delivery, export confirmed terms and rejected dangerous alternatives when they are reusable in later projects. Import the exported glossary into the next project as proposals unless the user explicitly marks it trusted.
