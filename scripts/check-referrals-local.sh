#!/usr/bin/env bash
#
# Local driver for the referral check, with a Claude Code session judging the
# pages by hand. The daily run is .github/workflows/check-referrals.yml, which
# classifies by phrase match; this is the manual escape hatch for checking
# wordings that phrase list does not cover. No model API key is involved.
#
# Usage:
#   scripts/check-referrals-local.sh fetch     # list Lambda -> batch.json -> fetch pages, write prompts
#   (session writes .referral-check-work/verdicts.json)
#   scripts/check-referrals-local.sh publish   # merge verdicts -> results.json -> Complete Lambda
#
# Needs local AWS credentials that can invoke the two Lambdas in us-east-1.
# The node script is taken from this script's own directory, so a copy of both
# files can run from anywhere inside the repo (node still resolves playwright
# from the repo root's node_modules).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
WORK="$ROOT/.referral-check-work"
REGION="us-east-1"
LIMIT="${LIMIT:-200}"

export BATCH_FILE="$WORK/batch.json"
export RESULTS_FILE="$WORK/results.json"
export REFERRAL_WORK_DIR="$WORK"

# Match on the shorter substring: CloudFormation truncates long function names
# (ReferralValidationCompleteFunction deploys as ...CompleteFuncti-<hash>).
resolve_fn() {
  local fn
  fn=$(aws lambda list-functions --region "$REGION" \
    --query "Functions[?contains(FunctionName, '$1')].FunctionName" \
    --output text | tr '\t' '\n' | grep -v '^$' | head -n 1)
  if [ -z "$fn" ]; then
    echo "ERROR: no Lambda matching '$1' in $REGION" >&2
    exit 1
  fi
  echo "$fn"
}

case "${1:-}" in
  fetch)
    mkdir -p "$WORK"
    rm -f "$RESULTS_FILE" "$WORK/complete-response.json"
    fn=$(resolve_fn ReferralValidationList)
    echo "Using $fn"
    aws lambda invoke --region "$REGION" --function-name "$fn" \
      --cli-binary-format raw-in-base64-out \
      --payload "{\"limit\": ${LIMIT}}" \
      --cli-read-timeout 70 \
      "$BATCH_FILE" >/dev/null
    echo "Batch size: $(jq '.referrals | length' "$BATCH_FILE")"
    node "$SCRIPT_DIR/check-referrals.js" --phase=fetch
    ;;
  publish)
    node "$SCRIPT_DIR/check-referrals.js" --phase=finish
    if [ "$(jq '.results | length' "$RESULTS_FILE")" = "0" ]; then
      echo "No results to post."
      exit 0
    fi
    fn=$(resolve_fn ReferralValidationComplete)
    echo "Using $fn"
    aws lambda invoke --region "$REGION" --function-name "$fn" \
      --cli-binary-format raw-in-base64-out \
      --payload "fileb://$RESULTS_FILE" \
      --cli-read-timeout 310 \
      "$WORK/complete-response.json" > "$WORK/complete-invoke.json"
    echo "Complete response:"
    cat "$WORK/complete-response.json"
    echo
    # aws lambda invoke exits 0 even when the handler throws; the error only
    # shows up as FunctionError in the invoke metadata.
    if jq -e '.FunctionError' "$WORK/complete-invoke.json" >/dev/null; then
      echo "ERROR: Complete Lambda failed (see response above)" >&2
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 fetch|publish" >&2
    exit 1
    ;;
esac
