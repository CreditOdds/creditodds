#!/usr/bin/env node
//
// Static check: any workflow job that runs a build script depending on
// data/cards.json must run `build:cards` earlier in the same job.
//
// data/cards.json is generated and gitignored (#1599), so it does not exist in
// a fresh CI checkout. build-best.yml and build-articles.yml both shipped
// without the build:cards step and broke for a month — build-best loudly, with
// hundreds of "Card slug not found" errors, and build-articles silently, with
// every related_cards_info coming out empty behind a green check.
//
// A grep is enough to prevent that recurring: the failure is always "the step
// isn't there", never something subtler.

const fs = require('fs');
const path = require('path');

const WORKFLOWS_DIR = path.join(__dirname, '..', '.github', 'workflows');

// Build scripts that read data/cards.json and therefore need it on disk first.
const DEPENDENT_SCRIPTS = ['build:articles', 'build:best', 'build:stores'];
const PROVIDER = 'build:cards';

function checkWorkflows() {
  const files = fs
    .readdirSync(WORKFLOWS_DIR)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  const violations = [];

  for (const file of files) {
    const lines = fs
      .readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8')
      .split('\n');

    // Line number of the first build:cards invocation, or Infinity if absent.
    // Comparing line positions is a deliberate simplification: these workflows
    // are single-job, so "earlier in the file" and "earlier in the job" are the
    // same thing. If a multi-job workflow ever needs this, revisit.
    const providerLine = lines.findIndex(
      l => !l.trimStart().startsWith('#') && l.includes(PROVIDER)
    );
    const providerAt = providerLine === -1 ? Infinity : providerLine;

    for (const script of DEPENDENT_SCRIPTS) {
      const at = lines.findIndex(
        l => !l.trimStart().startsWith('#') && l.includes(script)
      );
      if (at === -1) continue;

      if (providerAt > at) {
        violations.push({
          file,
          script,
          line: at + 1,
          reason:
            providerAt === Infinity
              ? `runs ${script} but never runs ${PROVIDER}`
              : `runs ${script} (line ${at + 1}) before ${PROVIDER} (line ${providerAt + 1})`,
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error(`Workflow card-dependency check failed (${violations.length}):\n`);
    for (const v of violations) {
      console.error(`  ${v.file}: ${v.reason}`);
    }
    console.error(
      `\ndata/cards.json is gitignored, so it is absent in a fresh checkout.` +
        `\nAdd this step before the ${DEPENDENT_SCRIPTS.join(' / ')} step:\n` +
        `\n      - name: Build cards.json\n        run: npm run ${PROVIDER}\n`
    );
    process.exit(1);
  }

  console.log(
    `Workflow card-dependency check passed (${files.length} workflow file(s) scanned).`
  );
}

checkWorkflows();
