#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

const prNumber = getArg('--pr') || process.env.PR_NUMBER;
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

if (!prNumber) {
  console.error('Missing --pr <number>');
  process.exit(1);
}
if (!repo) {
  console.error('Missing GITHUB_REPOSITORY env var');
  process.exit(1);
}
if (!token) {
  console.error('Missing GITHUB_TOKEN env var');
  process.exit(1);
}

const REJECT_FILE = path.join(__dirname, '..', 'data', 'news-rejected.yaml');
const HEADER = '# Rejected auto-news items (do not re-suggest)\n' +
  '# Entries are appended by the "Record Rejected News" workflow.\n';

function normalizeUrl(u) {
  if (!u || typeof u !== 'string') return '';
  return u
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\?.*$/, '')
    .replace(/\/+$/, '');
}

function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

async function githubRequest(endpoint) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function main() {
  const pr = await githubRequest(`/repos/${repo}/pulls/${prNumber}`);
  const headSha = pr.head?.sha;

  if (!headSha) {
    console.log('No head SHA found for PR. Exiting.');
    return;
  }

  const files = [];
  let page = 1;
  while (true) {
    const batch = await githubRequest(`/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    files.push(...batch);
    page += 1;
  }

  const newsFiles = files.filter(f => {
    const name = f.filename || '';
    return name.startsWith('data/news/') &&
      (name.endsWith('.yaml') || name.endsWith('.yml')) &&
      f.status !== 'removed';
  });

  if (newsFiles.length === 0) {
    console.log('No news files found in PR. Exiting.');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const newEntries = [];

  for (const file of newsFiles) {
    const contentResponse = await githubRequest(
      `/repos/${repo}/contents/${encodePath(file.filename)}?ref=${headSha}`
    );

    const content = Buffer.from(
      (contentResponse.content || '').replace(/\n/g, ''),
      'base64'
    ).toString('utf8');

    let parsed;
    try {
      parsed = yaml.load(content);
    } catch (err) {
      console.warn(`Skipping ${file.filename}: YAML parse failed (${err.message})`);
      continue;
    }

    if (!parsed || typeof parsed !== 'object') continue;

    const entry = {
      id: parsed.id || undefined,
      title: parsed.title || undefined,
      source_url: parsed.source_url || undefined,
      date_rejected: today,
      reason: `Rejected in PR #${prNumber}`,
      pr: Number(prNumber),
    };

    if (!entry.id && !entry.title && !entry.source_url) continue;
    newEntries.push(entry);
  }

  if (newEntries.length === 0) {
    console.log('No valid news entries found in PR. Exiting.');
    return;
  }

  let existing = [];
  if (fs.existsSync(REJECT_FILE)) {
    try {
      const existingContent = fs.readFileSync(REJECT_FILE, 'utf8');
      const loaded = yaml.load(existingContent);
      if (Array.isArray(loaded)) existing = loaded;
    } catch (err) {
      console.warn(`Warning: Could not read ${REJECT_FILE}: ${err.message}`);
    }
  }

  const existingIds = new Set(existing.map(e => e?.id).filter(Boolean));
  const existingUrls = new Set(existing.map(e => normalizeUrl(e?.source_url)).filter(Boolean));

  const dedupedNew = newEntries.filter(e => {
    const id = e.id;
    const url = normalizeUrl(e.source_url);
    if (id && existingIds.has(id)) return false;
    if (url && existingUrls.has(url)) return false;
    return true;
  });

  if (dedupedNew.length === 0) {
    console.log('All candidates already recorded. Exiting.');
    return;
  }

  const updated = [...dedupedNew, ...existing];
  const yamlOut = yaml.dump(updated, {
    quotingType: '"',
    forceQuotes: true,
    lineWidth: -1,
  });

  fs.writeFileSync(REJECT_FILE, `${HEADER}${yamlOut}`);
  console.log(`Recorded ${dedupedNew.length} rejected item(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
