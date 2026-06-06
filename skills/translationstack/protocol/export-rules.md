# Export Rules

Export is a state checkpoint, not a file concatenation step.

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
- no unconfirmed core term
- no marker mismatch
- no source coverage gap
- no duplicate chunk ID
- no empty translation

## Draft Export

If the user explicitly requests a draft export, record that decision and include a draft marker in `export/export_qa_report.json`.

## Export Files

Generate:

- `export/output.md`
- `export/review.html`
- `export/export_manifest.json`
- `export/export_qa_report.json`

After generating `export/review.html`, open it automatically in the local default browser for review. Prefer the platform command:

- macOS: `open <project-dir>/export/review.html`
- Linux: `xdg-open <project-dir>/export/review.html`
- Windows: `start <project-dir>\export\review.html`

Do not ask before opening this local review artifact. If the command fails or the environment has no GUI, report the absolute path instead.
