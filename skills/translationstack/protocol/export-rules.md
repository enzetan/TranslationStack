# Export Rules

Treat export as a state checkpoint, not as file concatenation.

## Default Export Policy

```yaml
export_policy:
  allow_pending: false
  allow_blocked: false
  allow_stale: false
  allow_open_high_issues: false
  allow_unreviewed: false
```

## Before Export

Check:

- every required chunk has translation
- no `blocked` chunk
- no `stale` chunk
- no high-severity open issue
- no medium-or-higher open issue in blocking categories for final export: terminology, citation/reference handling, source alignment, omission/addition, marker preservation, or readability. In `review/issues.jsonl`, enforce this through `issue.type`: `term`, `scripture_reference` when applicable, `accuracy`, `omission`, `addition`, `marker`, and `readability`.
- no unconfirmed core term
- no marker mismatch
- no source coverage gap
- no duplicate chunk ID
- no empty translation
- local image assets referenced by `export/output.md` exist relative to `export/output.md`
- review workbench data is non-empty and smoke-tested for any review handoff; record this as `checks.review_workbench_data_non_empty` and `checks.review_workbench_smoke_test` in `export/export_qa_report.json`

## Draft Export

If the user explicitly requests a draft export, record that decision and include a draft marker in `export/export_qa_report.json`.

Draft export may include open low/medium issues only when they are listed as known risks. Final export must include `publication_readiness_statement` in `export/export_qa_report.json`.

## Export Files

Generate:

- `export/output.md`
- `export/review.html` (share mode only — see `contract.md`)
- `export/export_manifest.json`, including `chunks` and `reusable_assets`
- `export/export_qa_report.json`, including `publication_readiness_statement`, workbench checks, and `reusable_assets`

During translation iteration, run the review workbench in **dev mode** with the live HTTP server. Start it once and leave it running across sessions:

```bash
bun skills/translationstack/scripts/serve.mjs <project-dir>
```

Use the printed URL and PID. Re-run `serve.mjs` to reuse an existing server on the same port; do not kill the server between turns.

Switch to **share mode** only when you need a self-contained file for offline review or hand-off:

```bash
bun skills/translationstack/scripts/render-review.mjs <project-dir>
open <project-dir>/export/review.html        # macOS
xdg-open <project-dir>/export/review.html    # Linux
start <project-dir>\export\review.html       # Windows
```

Do not declare the workbench step complete on visual inspection. Run `bun skills/translationstack/scripts/check-dev.mjs <project-dir>` and require exit code `0`. If check-dev reports "no dev server running", start one — the script does NOT spawn a server itself.

## Reusable Profile Export

After final delivery, export reusable project assets when the project created reusable decisions:

- confirmed glossary
- rejected or dangerous alternatives
- style guide
- accepted style samples
- translation memory
- gotchas from `memory/translation_memory.jsonl`
- citation/reference policy, including scripture policy when applicable
- domain/project profile

Import these assets into later projects as proposals unless the user explicitly promotes them.
