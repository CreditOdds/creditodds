#!/usr/bin/env node

/**
 * Notify IndexNow (Bing/Yandex/etc) about new or changed URLs.
 *
 * Usage: node scripts/submit-indexnow.js --type news|article --files <yaml-paths...>
 */

const fs = require('fs');
const yaml = require('js-yaml');

const HOST = 'creditodds.com';
const KEY = '7291a7c06ecb49c69782368f86aac82b';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

function parseArgs() {
  const args = process.argv.slice(2);
  let type = null;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      type = args[++i];
    } else if (args[i] === '--files') {
      files.push(...args.slice(i + 1));
      break;
    }
  }
  if (!type || !['news', 'article'].includes(type)) {
    console.error('Usage: node scripts/submit-indexnow.js --type news|article --files <yaml-paths...>');
    process.exit(1);
  }
  return { type, files };
}

function urlForItem(type, item) {
  if (type === 'news' && item.id) return `https://${HOST}/news/${item.id}`;
  if (type === 'article' && item.slug) return `https://${HOST}/articles/${item.slug}`;
  return null;
}

async function main() {
  const { type, files } = parseArgs();

  if (files.length === 0) {
    console.log('No files provided — nothing to submit.');
    return;
  }

  const urls = [];
  for (const filePath of files) {
    try {
      const item = yaml.load(fs.readFileSync(filePath, 'utf8'));
      const url = urlForItem(type, item);
      if (url) urls.push(url);
      else console.error(`  Skipping ${filePath}: missing id/slug`);
    } catch (err) {
      console.error(`  Failed to read ${filePath}: ${err.message}`);
    }
  }

  if (urls.length === 0) {
    console.log('No URLs to submit.');
    return;
  }

  console.log(`Submitting ${urls.length} URL(s) to IndexNow:`);
  urls.forEach((u) => console.log(`  ${u}`));

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: KEY_LOCATION,
      urlList: urls,
    }),
  });

  // 200 = accepted; 202 = accepted (validation pending)
  if (res.status === 200 || res.status === 202) {
    console.log(`IndexNow accepted (HTTP ${res.status}).`);
  } else {
    const body = await res.text().catch(() => '');
    console.error(`IndexNow returned HTTP ${res.status}: ${body}`);
    // Don't fail the workflow — search-engine pings are best-effort.
  }
}

main().catch((err) => {
  console.error('IndexNow submission error:', err.message);
});
