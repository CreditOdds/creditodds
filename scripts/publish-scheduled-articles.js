#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DRAFTS_DIR = path.join(__dirname, '..', 'data', 'articles', 'drafts');
const ARTICLES_DIR = path.join(__dirname, '..', 'data', 'articles');

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function main() {
  if (!fs.existsSync(DRAFTS_DIR)) {
    console.log('No drafts directory; nothing to publish.');
    return;
  }

  const today = todayUTC();
  const files = fs
    .readdirSync(DRAFTS_DIR)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

  if (files.length === 0) {
    console.log('No draft articles found.');
    return;
  }

  let moved = 0;

  for (const file of files) {
    const draftPath = path.join(DRAFTS_DIR, file);
    const content = fs.readFileSync(draftPath, 'utf8');

    let parsed;
    try {
      parsed = yaml.load(content);
    } catch (err) {
      console.error(`Skipping ${file}: invalid YAML — ${err.message}`);
      continue;
    }

    if (!parsed || !parsed.date) {
      console.error(`Skipping ${file}: missing date field`);
      continue;
    }

    if (parsed.date > today) {
      console.log(`Holding ${file} — scheduled for ${parsed.date} (today is ${today})`);
      continue;
    }

    const targetPath = path.join(ARTICLES_DIR, file);
    if (fs.existsSync(targetPath)) {
      console.error(`Skipping ${file}: target already exists at ${targetPath}`);
      continue;
    }

    fs.writeFileSync(targetPath, content);
    fs.unlinkSync(draftPath);
    console.log(`Published ${file} (date: ${parsed.date})`);
    moved++;
  }

  console.log(`\nPublished ${moved} article(s).`);
}

main();
