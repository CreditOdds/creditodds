#!/usr/bin/env bash
#
# Publish step for the daily Reddit product-change check. Runs AFTER
# `node scripts/sweep-reddit-product-changes.js --phase=finish` has written the
# accepted changes to data/reddit-product-changes/.
#
# Two jobs, mirroring check-reddit-datapoints-publish.sh:
#   1. Persist the seen-state (.github/reddit-product-change-state.json)
#      straight to main via the contents API — it must survive even when the PR
#      is closed unmerged, because "seen" means "presented for extraction", not
#      "accepted". Routing it through the PR would lose exactly the rejections
#      it needs to remember, and a rejected post would come back tomorrow.
#   2. Open the auto-product-changes-* review PR from a branch based on
#      origin/main.
#
# Usage: scripts/check-reddit-product-changes-publish.sh

set -euo pipefail

cd "$(dirname "$0")/.."

STATE_FILE=".github/reddit-product-change-state.json"
STATE_UPDATED=".reddit-pc-work/state-updated.json"
PR_BODY_FILE=".reddit-pc-work/pr-body.md"

# ── 1. Seen-state → main (contents API; never through the PR) ────────────────
if [ -f "$STATE_UPDATED" ] && ! cmp -s "$STATE_UPDATED" "$STATE_FILE"; then
  echo "=== Persisting seen-state ==="
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
  SHA="$(gh api "repos/${REPO}/contents/${STATE_FILE}?ref=main" --jq '.sha' 2>/dev/null || true)"
  ARGS=(-X PUT "repos/${REPO}/contents/${STATE_FILE}"
    -f message='chore: update reddit product-change seen-state [skip ci]'
    -f branch=main
    -f content="$(base64 < "$STATE_UPDATED" | tr -d '\n')")
  [ -n "$SHA" ] && ARGS+=(-f sha="$SHA")
  gh api "${ARGS[@]}" --jq '.commit.sha' | sed 's/^/Committed state as /'
  # The push went to origin/main; drop any local edit so the tree stays clean.
  git checkout -q -- "$STATE_FILE" 2>/dev/null || true
fi

# ── 2. Review PR ─────────────────────────────────────────────────────────────
if [ -z "$(git status --porcelain data/reddit-product-changes/)" ]; then
  echo "No product changes to propose."
  exit 0
fi

ORIGINAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BRANCH="auto-product-changes-$(date +%Y-%m-%d-%H%M%S)"

# Base on origin/main, not HEAD: run locally this may start from a feature
# branch, and the untracked data/reddit-product-changes/ files carry across the
# checkout because they are the only modified paths.
git fetch -q origin main
git checkout -q -b "$BRANCH" origin/main
git add data/reddit-product-changes/
git commit -q -m "Reddit product changes for review — $(date +%Y-%m-%d)"
git push -q -u origin "$BRANCH"

PR_ARGS=(--head "$BRANCH" --base main --title "Reddit product changes for review — $(date +%Y-%m-%d)")
if [ -f "$PR_BODY_FILE" ]; then
  PR_ARGS+=(--body-file "$PR_BODY_FILE")
else
  PR_ARGS+=(--body "Product changes extracted from r/CreditCards.")
fi
gh pr create "${PR_ARGS[@]}"

# Return to wherever the routine started so the checkout is left as found.
git checkout -q "$ORIGINAL_BRANCH"
