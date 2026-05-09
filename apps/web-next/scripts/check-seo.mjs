#!/usr/bin/env node
// Static SEO guards. Runs as `prebuild` so failures block deploy.
// Catches the regressions that surfaced in the 2026-05 Bing audit:
//   - alt="" on <CardImage>/<Image> (flagged as missing alt by crawlers)
//   - <h1> in loading.tsx (creates duplicate h1 in streamed HTML)

import { execSync } from 'node:child_process';

const SRC = 'src';
const failures = [];

function tryRun(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' });
  } catch (err) {
    if (err.status === 1) return ''; // grep/find no-match
    throw err;
  }
}

// 1. Empty alt on images. Bing's audit flags alt="" as "missing alt." If an
// image is truly decorative, set aria-hidden on its wrapper rather than
// leaving alt blank.
const emptyAlts = tryRun(`grep -rn 'alt=""' ${SRC} --include='*.tsx'`).trim();
if (emptyAlts) {
  failures.push(`Empty alt attribute (Bing flags as missing alt):\n${emptyAlts.split('\n').map((l) => '  ' + l).join('\n')}`);
}

// 2. <h1> inside any loading.tsx. With Next 15 streaming SSR the loading
// fallback ends up in the prerendered HTML, so an h1 here duplicates the real
// page h1. Use a div/span for the skeleton instead.
const loadingH1 = tryRun(`find ${SRC} -name 'loading.tsx' -exec grep -lE '<h1[ >]' {} +`).trim();
if (loadingH1) {
  failures.push(`<h1> inside loading.tsx (duplicates real h1 in streamed SSR):\n${loadingH1.split('\n').map((l) => '  ' + l).join('\n')}`);
}

if (failures.length > 0) {
  console.error('\nSEO check failed:\n');
  for (const f of failures) console.error(f + '\n');
  console.error('Fix the above before building.');
  process.exit(1);
}

console.log('SEO check passed.');
