#!/usr/bin/env node
// Second-batch generator for /best-card-for/[slug] store pages.
//
// Adds ~200 merchants beyond the original seed (_gen-stores.js). Metadata
// (slug/name/aliases/categories/website) was curated and validated for
// slug-uniqueness against the existing catalog; the distinctive intros were
// drafted per the same shape/length rules build:stores enforces.
//
// As with the first seed, after this lands, edit the generated YAML files
// directly (or via PR), NOT this script. build:stores is the gatekeeper.

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SCRATCH = process.env.GEN_SCRATCH; // dir holding meta200.json + out1..8.json
const STORES_DIR = path.join(__dirname, '..', 'data', 'stores');

const meta = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'meta200.json'), 'utf8'));
const intros = {};
for (let i = 1; i <= 8; i++) {
  Object.assign(intros, JSON.parse(fs.readFileSync(path.join(SCRATCH, `out${i}.json`), 'utf8')));
}

let written = 0;
const missing = [];
for (const m of meta) {
  const intro = intros[m.slug];
  if (!intro || intro.trim().length < 200) { missing.push(m.slug + (intro ? ` (len ${intro.trim().length})` : ' (no intro)')); continue; }
  const doc = {
    name: m.name,
    slug: m.slug,
    ...(m.aliases && m.aliases.length ? { aliases: m.aliases } : {}),
    categories: m.categories,
    ...(m.website ? { website: m.website } : {}),
    intro: intro.trim() + '\n',
  };
  const ymlBody = yaml.dump(doc, { lineWidth: -1, quotingType: '"', forceQuotes: false });
  fs.writeFileSync(path.join(STORES_DIR, `${m.slug}.yaml`), ymlBody);
  written++;
}
console.log(`Wrote ${written} store YAML files.`);
if (missing.length) { console.log(`MISSING/short intros (${missing.length}):`); console.log(missing.join('\n')); process.exitCode = 1; }
