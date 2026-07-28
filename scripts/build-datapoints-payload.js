#!/usr/bin/env node

/**
 * Build the invoke payload for the creditodds-import-reddit-records Lambda
 * from every YAML file in data/reddit-datapoints/. Used by
 * .github/workflows/sync-datapoints.yml.
 *
 * The full directory is sent every time — the Lambda skips rows whose
 * submitter_id (reddit:<source_id>) already exists, so the sync is a
 * declarative, idempotent "everything merged is imported".
 *
 * Writes .datapoints-payload.json and prints a summary.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const REPO_ROOT = path.join(__dirname, '..');
const DATAPOINTS_DIR = path.join(REPO_ROOT, 'data', 'reddit-datapoints');
const OUT_FILE = path.join(REPO_ROOT, '.datapoints-payload.json');

// Only the fields the records table stores; review-context fields
// (permalink, posted, evidence) stay in the repo.
const IMPORT_FIELDS = [
  'source_id', 'card_name', 'result', 'credit_score', 'credit_score_source',
  'listed_income', 'length_credit', 'starting_credit_limit', 'total_open_cards',
  'inquiries_3', 'inquiries_12', 'inquiries_24', 'bank_customer',
  'date_applied', 'reason_denied', 'reason_denied_code',
];

const files = fs.existsSync(DATAPOINTS_DIR)
  ? fs.readdirSync(DATAPOINTS_DIR).filter((f) => /\.ya?ml$/.test(f)).sort()
  : [];

const records = [];
let bad = 0;
for (const file of files) {
  try {
    const dp = yaml.load(fs.readFileSync(path.join(DATAPOINTS_DIR, file), 'utf8'));
    if (!dp || typeof dp !== 'object' || !dp.source_id) throw new Error('missing source_id');
    const record = {};
    for (const field of IMPORT_FIELDS) {
      if (dp[field] != null) record[field] = dp[field];
    }
    records.push(record);
  } catch (err) {
    console.error(`✗ ${file}: ${err.message.split('\n')[0]}`);
    bad++;
  }
}

fs.writeFileSync(OUT_FILE, JSON.stringify({ source: 'github-action', records }, null, 2));
console.log(`Payload: ${records.length} record(s) from ${files.length} file(s) -> ${path.relative(REPO_ROOT, OUT_FILE)}`);
if (bad > 0) {
  console.error(`${bad} file(s) unparseable — fix them before syncing.`);
  process.exit(1);
}
