#!/usr/bin/env bash
#
# Publish step for the local our_take refresh. Runs AFTER
# `node scripts/refresh-our-takes.js --phase=apply` has rewritten the YAML.
#
# Local counterpart to the publish half of .github/workflows/refresh-our-takes.yml,
# with one deliberate difference: the workflow committed straight to main, this
# opens a PR.
#
# Two reasons. First, this repo's rule is never commit directly to main, and a
# local routine runs under that rule where a bot workflow did not. Second, the
# workflow only needed its explicit `gh workflow run build-cards.yml` because a
# GITHUB_TOKEN push does not cascade into other workflows. A human merging a PR
# is a real push, so Build and Deploy Cards fires on its own `data/cards/**`
# trigger and the dispatch hack disappears.
#
# Usage:  scripts/refresh-our-takes-publish.sh

set -euo pipefail

cd "$(dirname "$0")/.."

DATE=$(date +%Y-%m-%d)

if [ -z "$(git status --porcelain data/cards/)" ]; then
  echo "No take changes this run."
  exit 0
fi

echo "=== Validating updated card data ==="
if ! npm run build:cards; then
  echo "ERROR: card validation failed — reverting changes." >&2
  git checkout -- data/cards/
  exit 1
fi
# Regenerated artifacts are never committed from a card PR; CI rebuilds them.
git checkout -- data/cards.json 2>/dev/null || true
git checkout -- data/best.json 2>/dev/null || true

CHANGED=$(git status --porcelain data/cards/ | wc -l | tr -d ' ')
ORIGINAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BRANCH="auto/our-takes-refresh-${DATE}"

echo "=== Opening PR for ${CHANGED} refreshed take(s) ==="

# Base on origin/main, not HEAD: the routine may well run from a feature branch,
# and branching off HEAD would sweep its unrelated commits into this PR.
git fetch -q origin main
git stash push -q -m "our-takes-refresh" -- data/cards/
git checkout -q -B "$BRANCH" origin/main
git stash pop -q

git add data/cards/
git commit -q -m "chore: refresh our_take editorial copy (${DATE})"
git push -q -u origin "$BRANCH"

BODY_FILE=$(mktemp)
{
  printf 'Twice-monthly regeneration of the `our_take` editorial paragraph, written in-session by the local `our-takes-refresh-local` routine rather than by a gpt-4o call per card.\n\n'
  printf '**%s card(s) changed.** Cards whose copy came out byte-identical are not touched, so everything in this diff is a real rewrite.\n\n' "$CHANGED"
  printf 'House style is pinned in the prompt: one paragraph, no em dashes, lead with the strongest reason to carry the card, name the catch honestly, no clickbait.\n\n'
  printf 'Skim for accuracy against each card. Merging fires Build and Deploy Cards on the `data/cards/**` push trigger, which refreshes cards.json on the CDN.\n'
} > "$BODY_FILE"

PR_URL=$(gh pr create \
  --title "chore: refresh our_take editorial copy — ${DATE}" \
  --body-file "$BODY_FILE")
rm -f "$BODY_FILE"

echo "PR: $PR_URL"
git checkout -q "$ORIGINAL_BRANCH"
