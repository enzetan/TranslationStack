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
- `export/review.html` (share mode only — see `contract.md`)
- `export/export_manifest.json`
- `export/export_qa_report.json`

The review workbench runs in **dev mode** during translation iteration (live HTTP server, no file written). Start it once and leave it running — the server is designed to be re-used across sessions:

```bash
bun skills/translationstack/scripts/serve.mjs <project-dir>
# On startup, the server:
#   - prints the URL (default http://127.0.0.1:7878) and its PID
#   - auto-opens the browser (use --no-open to skip)
# Re-running serve.mjs while a server is already on the same port is
# idempotent: it prints the existing URL and exits 0. The server does
# NOT get killed between turns.
```

Switch to **share mode** only when you need a self-contained file for offline review or hand-off:

```bash
bun skills/translationstack/scripts/render-review.mjs <project-dir>
# then:
open <project-dir>/export/review.html        # macOS
xdg-open <project-dir>/export/review.html    # Linux
start <project-dir>\export\review.html       # Windows
```

Do not declare the workbench step complete on visual inspection. Run `bun skills/translationstack/scripts/check-dev.mjs <project-dir>` and require exit code `0`. If check-dev reports "no dev server running", start one — the script does NOT spawn a server itself.
