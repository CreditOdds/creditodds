#!/usr/bin/env bash
# Enable (or rotate) the x-origin-verify shared secret between the API's
# CloudFront distribution and the Lambda fleet.
#
# What it does, in order:
#   1. Generates a fresh secret and sets it as a custom origin header
#      (x-origin-verify) on the API Gateway origin of the CloudFront
#      distribution.
#   2. Waits for the distribution to finish deploying, so every origin
#      request carries the header before enforcement starts.
#   3. Sets the OriginVerifySecret stack parameter (all other parameters
#      keep their previous values), which populates ORIGIN_VERIFY_SECRET
#      on every function via Globals.
#
# First-time enable is seamless: until step 3 lands, the empty stack param
# keeps getClientIp in legacy mode and the header is ignored.
#
# ROTATION CAVEAT: between step 1 and the end of step 3, CloudFront sends the
# NEW secret while the stack still holds the OLD one, so getClientIp falls
# back to sourceIp (a CloudFront edge address) for CloudFront-routed traffic.
# That direction is safe (no forgery possible) but coarsens anonymous dedup
# for the few minutes the rollout takes — e.g. two visitors behind the same
# edge IP would collide on POST /ratings. Rotate during a quiet window.
#
# Requires: aws CLI with rights on cloudfront:GetDistributionConfig/
# UpdateDistribution and cloudformation:UpdateStack, plus jq.
set -euo pipefail

DIST_ID="${DIST_ID:-E2IVU8Y8I7H6WK}"        # CloudFront in front of API Gateway (d2ojrhbh2dincr / api.creditodds.com)
ORIGIN_ID="${ORIGIN_ID:-api-gateway-origin}"
STACK="${STACK:-CreditCardOddsAPI}"
REGION="${REGION:-us-east-1}"

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

# Refuse to run before the stack knows the parameter (i.e. before the PR
# adding OriginVerifySecret to template.yml has deployed).
aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Parameters[].ParameterKey" --output json | grep -q OriginVerifySecret || {
  echo "Stack $STACK has no OriginVerifySecret parameter yet - deploy the template change first." >&2
  exit 1
}

SECRET=$(openssl rand -hex 32)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "1/3 Setting x-origin-verify on CloudFront origin '$ORIGIN_ID' of $DIST_ID..."
aws cloudfront get-distribution-config --id "$DIST_ID" > "$TMP/full.json"
ETAG=$(jq -r .ETag "$TMP/full.json")
jq --arg secret "$SECRET" --arg oid "$ORIGIN_ID" '
  .DistributionConfig
  | (.Origins.Items[] | select(.Id == $oid) | .CustomHeaders) =
      {Quantity: 1, Items: [{HeaderName: "x-origin-verify", HeaderValue: $secret}]}
' "$TMP/full.json" > "$TMP/updated.json"
aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" \
  --distribution-config "file://$TMP/updated.json" \
  --query Distribution.Status --output text

echo "2/3 Waiting for the distribution to deploy (typically 3-10 minutes)..."
aws cloudfront wait distribution-deployed --id "$DIST_ID"

echo "3/3 Setting the OriginVerifySecret stack parameter on $STACK..."
PARAMS=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Parameters[].ParameterKey" --output json |
  jq --arg secret "$SECRET" '[.[] | if . == "OriginVerifySecret"
      then {ParameterKey: ., ParameterValue: $secret}
      else {ParameterKey: ., UsePreviousValue: true} end]')
aws cloudformation update-stack --stack-name "$STACK" --region "$REGION" \
  --use-previous-template --parameters "$PARAMS" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM
aws cloudformation wait stack-update-complete --stack-name "$STACK" --region "$REGION"

echo "Done. Direct execute-api callers can no longer forge X-Forwarded-For."
