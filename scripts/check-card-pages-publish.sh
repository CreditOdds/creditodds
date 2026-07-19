#!/usr/bin/env bash
#
# Publish step for the local card-page check. Runs AFTER
# `node scripts/check-card-pages.js --phase=finish` has applied the YAML edits.
#
# This is the local counterpart to everything .github/workflows/check-card-pages.yml
# does around the script: validate, persist skip state, open a PR, and file the
# stale-card issue. The check itself is driven by the Claude Code session (see the
# `card-page-check-local` scheduled task), because the extraction happens there.
#
# Usage:  scripts/check-card-pages-publish.sh [card-slug]

set -euo pipefail

cd "$(dirname "$0")/.."

STATE_FILE=".github/card-page-check-state.json"
SUMMARY_FILE=".card-page-check-summary.md"
STALE_FILE=".card-page-check-stale.md"
CARD_SLUG="${1:-}"

if [ -n "$(git status --porcelain data/cards/)" ]; then
  echo "=== Validating updated card data ==="
  if ! npm run build:cards; then
    echo "ERROR: card validation failed — reverting changes." >&2
    git checkout -- data/cards/
    exit 1
  fi
  # build:cards regenerates data/cards.json, which is never committed from a
  # card PR — CI rebuilds it.
  git checkout -- data/cards.json 2>/dev/null || true
fi

# Skip counters must survive the run even when nothing else does — a card that
# is quietly rotting produces no PR, and the counter is the only thing that
# eventually notices. Pushed through the contents API rather than a local commit
# for the same reason CI does it: the card edits are sitting uncommitted in the
# working tree for the PR step below, and a commit/stash dance here risks
# eating them.
if [ -n "$(git status --porcelain "$STATE_FILE")" ]; then
  echo "=== Persisting skip-tracking state ==="
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
  SHA="$(gh api "repos/${REPO}/contents/${STATE_FILE}?ref=main" --jq '.sha' 2>/dev/null || true)"
  ARGS=(-X PUT "repos/${REPO}/contents/${STATE_FILE}"
    -f message='chore: update card-page skip-tracking state [skip ci]'
    -f branch=main
    -f content="$(base64 < "$STATE_FILE" | tr -d '\n')")
  [ -n "$SHA" ] && ARGS+=(-f sha="$SHA")
  gh api "${ARGS[@]}" --jq '.commit.sha' | sed 's/^/Committed state as /'
  git checkout -- "$STATE_FILE"
fi

ORIGINAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ -n "$(git status --porcelain data/cards/)" ]; then
  echo "=== Opening PR ==="
  SLUG="${CARD_SLUG:-all}"
  BRANCH="card-page-check-${SLUG}-$(date +%Y-%m-%d-%H%M%S)"
  git checkout -q -b "$BRANCH"
  git add data/cards/
  git commit -q -m "Card page check — $(date +%Y-%m-%d)"
  git push -q -u origin "$BRANCH"

  TITLE="Card Page Check $(date +%Y-%m-%d)"
  if [ -f "$SUMMARY_FILE" ]; then
    PR_URL=$(gh pr create --title "$TITLE" --body-file "$SUMMARY_FILE")
  else
    PR_URL=$(gh pr create --title "$TITLE" --body "Card page check. Please review changes to card YAML files.")
  fi
  echo "PR: $PR_URL"
  git checkout -q "$ORIGINAL_BRANCH"
else
  echo "No changes detected."
fi

# Same contract as the workflow: a card unverified for several runs running is a
# data-integrity problem, so it gets an issue and a non-zero exit rather than
# another quiet green.
if [ -f "$STALE_FILE" ]; then
  COUNT=$(grep -c '^| \[' "$STALE_FILE" || true)
  TITLE="Cards unverified for several runs — ${COUNT:-?} card(s)"
  gh label create "card-page-stale" \
    --description "Cards the daily page check has failed to verify for several runs running" \
    --color "b60205" 2>/dev/null || true
  EXISTING=$(gh issue list --state open --label "card-page-stale" --limit 1 --json number --jq '.[0].number // empty')
  if [ -n "$EXISTING" ]; then
    gh issue edit "$EXISTING" --title "$TITLE" --body-file "$STALE_FILE"
  else
    gh issue create --title "$TITLE" --label "card-page-stale" --body-file "$STALE_FILE"
  fi
  echo "ERROR: cards have gone unverified for several consecutive runs." >&2
  cat "$STALE_FILE"
  exit 1
fi

EXISTING=$(gh issue list --state open --label "card-page-stale" --limit 1 --json number --jq '.[0].number // empty')
if [ -n "$EXISTING" ]; then
  gh issue close "$EXISTING" --comment "All cards verified on $(date -u +%Y-%m-%dT%H:%M:%SZ). Closing automatically."
fi
echo "Every card was verified against its live page."
