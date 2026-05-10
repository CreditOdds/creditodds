# Article Drafts (Scheduled Publishing)

Articles in this folder are **not yet published**. They sit here until their `date` field has been reached, at which point a daily GitHub Actions cron (`.github/workflows/publish-scheduled-articles.yml`) moves them into `data/articles/`, which fires the normal build pipeline (`build-articles.yml`) — building `articles.json`, syncing hero images, posting to social, and submitting to IndexNow.

## How it works

- The article build script (`scripts/build-articles.js`) only reads `*.yaml` / `*.yml` directly inside `data/articles/`. Subdirectories — including this one — are ignored, so drafts never leak into `articles.json`.
- `scripts/publish-scheduled-articles.js` runs daily at 14:00 UTC. For each YAML in `drafts/` whose `date` is on or before today (UTC), it copies the file into `data/articles/` and deletes the draft. It commits and pushes if anything moved.
- The new file landing in `data/articles/` triggers the existing `build-articles.yml` workflow, which treats it as a brand-new article (added file, not a rename) — so social posts and IndexNow submissions still fire correctly.

## Adding a scheduled article

1. Drop the YAML in this folder.
2. Set `date:` to the day you want it to publish (UTC).
3. Commit and push. It'll publish itself when the day arrives.

To manually publish ahead of schedule, run the workflow with `workflow_dispatch` or just `git mv drafts/foo.yaml ../foo.yaml`.
