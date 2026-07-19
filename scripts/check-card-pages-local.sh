#!/usr/bin/env bash
#
# Local counterpart to .github/workflows/check-card-pages.yml.
#
# Runs the nightly card-page check with the Claude CLI as the extractor instead
# of gpt-4o, then reproduces the steps the workflow performs around the script:
# validate, persist skip state, open a PR, and report cards that have gone
# unverified. The script itself is unchanged between the two paths — only
# CARD_PAGE_EXTRACTOR differs — so a local run and a CI run produce the same
# artifacts.
#
# Prerequisite: `claude setup-token` (one time) so the CLI can run headless.
#
# Usage:  scripts/check-card-pages-local.sh [card-slug]

set -euo pipefail

cd "$(dirname "$0")/.."

STATE_FILE=".github/card-page-check-state.json"
SUMMARY_FILE=".card-page-check-summary.md"
STALE_FILE=".card-page-check-stale.md"

export CARD_PAGE_EXTRACTOR=claude
export CARD_SLUG="${1:-}"

# The check writes into data/cards/, so it needs that path clean — otherwise a
# PR would sweep up whatever the user happened to be editing. Only data/cards/
# is checked; unrelated work elsewhere in the tree is none of this run's
# business and is left alone.
if [ -n "$(git status --porcelain data/cards/)" ]; then
  echo "ERROR: data/cards/ has uncommitted changes. Commit or stash them first." >&2
  exit 1
fi

ORIGINAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
# Always land back on the branch the user was on, however this exits.
trap 'git checkout -q "$ORIGINAL_BRANCH" 2>/dev/null || true' EXIT

git fetch -q origin main
git checkout -q main
git pull -q --ff-only origin main

rm -f "$SUMMARY_FILE" "$STALE_FILE"

echo "=== Running card page check (extractor: claude) ==="
SCRIPT_STATUS=0
node scripts/check-card-pages.js || SCRIPT_STATUS=$?

# A preflight failure means nothing ran — no state to persist, no PR to open.
# Bail before the reporting steps so an auth problem doesn't masquerade as a
# clean night with zero changes.
if [ "$SCRIPT_STATUS" -ne 0 ] && [ ! -f "$STATE_FILE" ]; then
  echo "Check script failed before producing state — aborting." >&2
  exit "$SCRIPT_STATUS"
fi

if [ -n "$(git status --porcelain data/cards/)" ]; then
  echo "=== Validating updated card data ==="
  if ! npm run build:cards; then
    echo "ERROR: card validation failed — reverting changes." >&2
    git checkout -- data/cards/
    exit 1
  fi
  # build:cards regenerates cards.json, which is never committed from a card PR.
  git checkout -- data/cards.json 2>/dev/null || true
fi

# Skip counters must survive the run even when nothing else does — a card that
# is quietly rotting produces no PR, and the counter is the only thing that
# eventually notices. Pushed through the contents API rather than a local
# commit for the same reason CI does it: the card edits are sitting uncommitted
# in the working tree for the PR step below, and a commit/stash dance here
# risks eating them.
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
  # Drop the local copy now that main owns it, so the PR branch below doesn't
  # carry a duplicate of the same change.
  git checkout -- "$STATE_FILE"
fi

PR_URL=""
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
