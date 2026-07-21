#!/usr/bin/env bash
#
# Publish step for the local rewards-and-benefits check. Runs AFTER
# `node scripts/check-card-rewards-and-benefits.js --phase=finish` has applied
# the YAML edits.
#
# This is the local counterpart to everything
# .github/workflows/check-card-rewards-and-benefits.yml does around the script:
# validate, open one PR per modified card, and file the weekly review issue.
# The check itself is driven by the Claude Code session (see the
# `card-rewards-benefits-local` scheduled task), because the extraction happens
# there rather than through a paid gpt-4o call per card.
#
# Usage:  scripts/check-card-rewards-benefits-publish.sh

set -euo pipefail

cd "$(dirname "$0")/.."

REVIEW_FILE=".card-rewards-benefits-review.md"
SUMMARY_FILE=".card-rewards-benefits-summary.md"
DATE=$(date +%Y-%m-%d)

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

ORIGINAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ -z "$(git status --porcelain data/cards/)" ]; then
  echo "No card YAMLs changed."
else
  echo "=== Opening one PR per modified card ==="
  # One PR per card, matching the workflow: a rewards/benefits change needs
  # verifying against that card's apply page, and a 12-card bundle makes that
  # review impossible to do honestly.
  #
  # Stash everything, then re-apply a single card at a time onto a fresh branch
  # cut from origin/main. Branching off HEAD would sweep unrelated local commits
  # into a PR that should contain nothing but one card's YAML.
  git stash push -q -m "rewards-and-benefits-check" -- data/cards/
  git fetch -q origin main

  for FILE in $(git stash show "stash@{0}" --name-only); do
    SLUG=$(basename "$FILE" .yaml)
    BRANCH="auto/${SLUG}-rewards-benefits-${DATE}"

    # Idempotency: don't spam a second PR if last week's is still open.
    if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
      echo "  Branch $BRANCH already on origin — skipping $SLUG"
      continue
    fi

    git checkout -q -B "$BRANCH" origin/main
    git checkout "stash@{0}" -- "$FILE"

    # Use the YAML parser rather than awk: the writer does not force quotes,
    # so naive field splitting returns empty strings.
    CARD_NAME=$(node -e "console.log(require('js-yaml').load(require('fs').readFileSync('$FILE','utf8')).name || '')")
    APPLY_LINK=$(node -e "console.log(require('js-yaml').load(require('fs').readFileSync('$FILE','utf8')).apply_link || '')")

    git add "$FILE"
    git commit -q -m "Auto: ${CARD_NAME} rewards/benefits check ${DATE}"
    git push -q -u origin "$BRANCH"

    BODY_FILE=$(mktemp)
    {
      printf 'The weekly rewards-and-benefits check picked up changes on the apply page for **%s**.\n\n' "$CARD_NAME"
      printf '**Apply link (verify against this):** %s\n\n' "$APPLY_LINK"
      printf 'Opened by `scripts/check-card-rewards-and-benefits.js` via the local `card-rewards-benefits-local` routine. Only changes that passed the editorial filter in `data/benefit-policy.yaml` are here; borderline items were routed to the weekly review issue instead, and benefits previously removed from this card were skipped.\n\n'
      printf 'Review against the live apply page before merging.\n'
    } > "$BODY_FILE"

    gh pr create \
      --title "Auto: ${CARD_NAME} rewards/benefits update — ${DATE}" \
      --body-file "$BODY_FILE" || echo "  PR creation failed for $SLUG (continuing)"
    rm -f "$BODY_FILE"
  done

  git checkout -q "$ORIGINAL_BRANCH"
  git stash drop -q "stash@{0}" || true
fi

if [ -s "$REVIEW_FILE" ]; then
  echo "=== Opening weekly review issue ==="
  ISSUE_BODY=$(printf '%s\n\n%s' \
    "Weekly review queue from the local \`card-rewards-benefits-local\` routine. Two kinds of items show up here: (a) **stale rotating-category periods** — quarterly cards (Discover It, Freedom Flex, etc.) whose \`current_period\` doesn't match this quarter, and (b) **borderline benefits** the checker spotted on apply pages but couldn't auto-PR (generic travel insurance, secondary CDW, purchase protection, and similar). Triage each manually." \
    "$(cat "$REVIEW_FILE")")
  gh issue create \
    --title "Card benefits review — ${DATE}" \
    --body "$ISSUE_BODY" || echo "Issue creation failed (continuing)"
else
  echo "Nothing to review (no borderline items, no stale rotating periods)."
fi

if [ -f "$SUMMARY_FILE" ]; then
  echo ""
  echo "=== Run summary ==="
  cat "$SUMMARY_FILE"
fi
