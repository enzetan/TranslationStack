# Glossary Rules

Glossary entries are project-level translation rules.

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
- Each important term should include a `note` that explains context.

## Impact

When a confirmed term is added, changed, deleted, or rejected after use:

1. Create an impact report in `review/impact-*.json`.
2. Ask before global propagation when many chunks are affected.
3. Mark affected chunks as `stale`.
4. Revise stale chunks only after confirmation.

