# State Machine

TranslationStack has two layers:

- Project flow: the recommended order an agent should follow.
- Chunk/segment lifecycle: the durable state of every translation unit.

## Valid States

```text
planned
pending
translated
reviewing
reviewed
stale
blocked
exported
```

## Meaning

| State | Meaning |
|---|---|
| `planned` | Chunk is declared but coverage is not validated. |
| `pending` | Chunk is ready to translate. |
| `translated` | Translation exists but review is not complete. |
| `reviewing` | Review is active or open issues exist. |
| `reviewed` | Review passed and export is allowed if policy permits. |
| `stale` | Glossary, style, source, or context changed after translation. |
| `blocked` | User decision or contract repair is required. |
| `exported` | Chunk was included in an export. |

## Valid Transitions

| From | To |
|---|---|
| `planned` | `pending`, `blocked` |
| `pending` | `translated`, `blocked` |
| `translated` | `reviewing`, `reviewed`, `stale`, `blocked` |
| `reviewing` | `reviewed`, `translated`, `stale`, `blocked` |
| `reviewed` | `exported`, `stale`, `reviewing` |
| `stale` | `translated`, `blocked` |
| `blocked` | `planned`, `pending`, `translated`, `reviewing` |
| `exported` | `stale` |

## Rules

- Do not translate `planned` chunks.
- Do not export `pending`, `blocked`, or `stale` chunks.
- Do not silently skip `reviewed` chunks when a glossary, style, source, or context change makes them stale.
- `blocked` means stop and ask the user.
- `stale` is not failure; it is the mechanism for targeted revision.

