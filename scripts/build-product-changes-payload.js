#!/usr/bin/env node

/**
 * Build the invoke payload for the creditodds-import-reddit-product-changes
 * Lambda from every YAML file in data/reddit-product-changes/. Used by
 * .github/workflows/sync-product-changes.yml.
 *
 * Mirrors build-datapoints-payload.js: the full directory is sent every time,
 * and the Lambda skips source_ids it already holds, so the sync is a
 * declarative, idempotent "everything merged is imported".
 *
 * Writes .product-changes-payload.json and prints a summary.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const REPO_ROOT = path.join(__dirname, '..');
const CHANGES_DIR = path.join(REPO_ROOT, 'data', 'reddit-product-changes');
const OUT_FILE = path.join(REPO_ROOT, '.product-changes-payload.json');

// Only the fields the table stores. `posted` and the review-context prose stay
// repo-side; `evidence` and `permalink` are carried through because they are
// the audit trail for a row that no user can vouch for.
const IMPORT_FIELDS = [
  'source_id', 'from_card', 'to_card', 'change_month', 'reason',
  'evidence', 'permalink',
];

const files = fs.existsSync(CHANGES_DIR)
  ? fs.readdirSync(CHANGES_DIR).filter((f) => /\.ya?ml$/.test(f)).sort()
  : [];

const changes = [];
let bad = 0;
for (const file of files) {
  try {
    const pc = yaml.load(fs.readFileSync(path.join(CHANGES_DIR, file), 'utf8'));
    if (!pc || typeof pc !== 'object' || !pc.source_id) throw new Error('missing source_id');
    const change = {};
    for (const field of IMPORT_FIELDS) {
      if (pc[field] != null) change[field] = pc[field];
    }
    changes.push(change);
  } catch (err) {
    console.error(`✗ ${file}: ${err.message.split('\n')[0]}`);
    bad++;
  }
}

fs.writeFileSync(OUT_FILE, JSON.stringify({ source: 'github-action', changes }, null, 2));
console.log(`Payload: ${changes.length} change(s) from ${files.length} file(s) -> ${path.relative(REPO_ROOT, OUT_FILE)}`);
if (bad > 0) {
  console.error(`${bad} file(s) unparseable — fix them before syncing.`);
  process.exit(1);
}
