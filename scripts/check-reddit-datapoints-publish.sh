#!/usr/bin/env bash
#
# Publish step for the daily Reddit data-point check. Runs AFTER
# `node scripts/check-reddit-datapoints.js --phase=finish` has written the
# accepted candidates to data/reddit-datapoints/.
#
# Two jobs, mirroring check-card-pages-publish.sh / check-card-news-publish.sh:
#   1. Persist the seen-state (.github/reddit-datapoint-state.json) straight to
#      main via the contents API — it must survive even when the PR is closed
#      unmerged, because "seen" means "presented for extraction", not "accepted".
#   2. Open the auto-datapoints-* review PR from a branch based on origin/main.
#
# Usage: scripts/check-reddit-datapoints-publish.sh

set -euo pipefail

cd "$(dirname "$0")/.."

STATE_FILE=".github/reddit-datapoint-state.json"
STATE_UPDATED=".reddit-dp-work/state-updated.json"
PR_BODY_FILE=".reddit-dp-work/pr-body.md"

# ── 1. Seen-state → main (contents API; never through the PR) ────────────────
# Same rationale as the card-page skip counters: the state has to persist even
# when nothing else from this run does, and the data-point files are sitting
# uncommitted in the working tree for the PR step below, so a local
# commit/stash dance risks eating them.
if [ -f "$STATE_UPDATED" ] && ! cmp -s "$STATE_UPDATED" "$STATE_FILE"; then
  echo "=== Persisting seen-state ==="
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
  SHA="$(gh api "repos/${REPO}/contents/${STATE_FILE}?ref=main" --jq '.sha' 2>/dev/null || true)"
  ARGS=(-X PUT "repos/${REPO}/contents/${STATE_FILE}"
    -f message='chore: update reddit data-point seen-state [skip ci]'
    -f branch=main
    -f content="$(base64 < "$STATE_UPDATED" | tr -d '\n')")
  [ -n "$SHA" ] && ARGS+=(-f sha="$SHA")
  gh api "${ARGS[@]}" --jq '.commit.sha' | sed 's/^/Committed state as /'
  # The push went to origin/main; drop any local edit so the tree stays clean.
  git checkout -q -- "$STATE_FILE" 2>/dev/null || true
fi

# ── 2. Review PR ─────────────────────────────────────────────────────────────
if [ -z "$(git status --porcelain data/reddit-datapoints/)" ]; then
  echo "No data points to propose."
  exit 0
fi

ORIGINAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BRANCH="auto-datapoints-$(date +%Y-%m-%d-%H%M%S)"

# Base on origin/main, not HEAD: run locally this may start from a feature
# branch, and the untracked data/reddit-datapoints/ files carry across the
# checkout because they are the only modified paths.
git fetch -q origin main
git checkout -q -b "$BRANCH" origin/main
git add data/reddit-datapoints/
git commit -q -m "Reddit data points for review — $(date +%Y-%m-%d)"
git push -q -u origin "$BRANCH"

if [ -f "$PR_BODY_FILE" ]; then
  PR_URL=$(gh pr create --title "Reddit Data Points $(date +%Y-%m-%d)" --body-file "$PR_BODY_FILE")
else
  PR_URL=$(gh pr create --title "Reddit Data Points $(date +%Y-%m-%d)" --body "Proposed Reddit data points. Review each file, delete rejects, merge to import.")
fi
echo "PR: $PR_URL"
git checkout -q "$ORIGINAL_BRANCH"
