import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
const root = path.resolve('../..');
const cache = path.resolve('.static-cache');
await fs.mkdir(cache, { recursive: true });
// Rebuild content from the checked-out revision, including newly published slugs.
let buildLog = '';
for (const kind of ['cards', 'news', 'articles', 'best', 'stores']) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', `build-${kind}.js`)], { cwd: root, encoding: 'utf8' });
  buildLog += result.stdout + result.stderr;
  if (result.status !== 0) throw new Error(`Content build failed (${kind}): ${result.stderr || result.stdout}`);
}
await fs.writeFile(path.join(cache, 'content-build.log'), buildLog);
// Native Next data caching deduplicates public reads inside this build only.
await fs.rm('.next/cache/fetch-cache', { recursive: true, force: true });
const api = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://d2ojrhbh2dincr.cloudfront.net';
// One catalog read per build; all pages and client pickers share this snapshot.
const res = await fetch(`${api}/cards`, { signal: AbortSignal.timeout(30000) });
if (!res.ok) throw new Error(`Catalog: ${res.status}`);
const cards = await res.json();
if (!Array.isArray(cards) || !cards.length || cards.some(c => !c.slug)) throw new Error('Invalid card catalog');
await fs.writeFile(path.join(cache, 'cards.json'), JSON.stringify(cards));
const sources = new Set();
const cdn = 'https://d3ay3etzd1512y.cloudfront.net';
const raster = /\.(?:png|jpe?g|webp|avif)(?:\?[^\s"'<>)]*)?$/i;
function walk(value, kind) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/https:\/\/[^\s"'<>()[\]\\]+/g)) {
      const url = match[0];
      if (raster.test(url) && ['d3ay3etzd1512y.cloudfront.net', 'credit-card-data-site.s3.us-east-2.amazonaws.com'].includes(new URL(url).hostname)) sources.add(url);
    }
  } else if (Array.isArray(value)) value.forEach(v => walk(v, kind));
  else if (value && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      if (typeof val === 'string' && raster.test(val) && !val.includes('://') && ['image', 'card_image_link', 'news_image'].includes(key)) {
        sources.add(`${cdn}/${key === 'news_image' ? 'news_images' : key === 'card_image_link' || kind === 'cards' || ('slug' in value && 'name' in value) ? 'card_images' : 'article_images'}/${val}`);
      }
      if (key === 'card_image_links' && Array.isArray(val)) val.filter(v => typeof v === 'string').forEach(v => sources.add(`${cdn}/card_images/${v}`));
      walk(val, kind);
    }
  }
}
walk(cards, 'cards');
for (const kind of ['news', 'articles', 'best']) walk(JSON.parse(await fs.readFile(path.join(root, 'data', `${kind}.json`))), kind);
async function files(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(path.join(dir,e.name)) : path.join(dir,e.name)))).flat();
}
for (const file of await files('public')) if (raster.test(file) && !file.startsWith('public/_images/')) sources.add('/' + path.relative('public',file));
const manifest = {};
await fs.rm('public/_images', { recursive: true, force: true });
await fs.mkdir('public/_images', { recursive: true });
const queue = [...sources].sort();
let completed = 0;
async function worker() {
  for (;;) {
    const src = queue.shift(); if (!src) return;
    const sourceKey = createHash('sha256').update(src).digest('hex');
    const original = path.join(cache, sourceKey);
    let bytes;
    try {
      if (process.env.STATIC_REFRESH_IMAGES === '1' || src.startsWith('/')) throw new Error('Refresh source');
      bytes = await fs.readFile(original);
    }
    catch {
      if (src.startsWith('/')) bytes = await fs.readFile(path.join('public', src));
      else {
        const response = await fetch(src, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Image ${response.status}: ${src}`);
        bytes = Buffer.from(await response.arrayBuffer());
      }
      await fs.writeFile(original, bytes);
    }
    const key = createHash('sha256').update(bytes).digest('hex').slice(0,20);
    manifest[src] = key;
    for (const width of [32,96,256,640,1200]) {
      const variant = path.join(cache, `${key}-${width}.webp`);
      try { await fs.access(variant); }
      catch { await sharp(bytes).resize({ width, withoutEnlargement: true }).webp({ quality: 75 }).toFile(variant); }
      await fs.copyFile(variant, `public/_images/${key}-${width}.webp`);
    }
    completed++;
    if (completed % 100 === 0) console.log(`Optimized ${completed}/${sources.size} images`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
await fs.writeFile('src/lib/static-images.json', JSON.stringify(manifest));
console.log(`Static inputs: ${cards.length} cards, ${sources.size} optimized images`);
