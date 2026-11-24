#!/usr/bin/env node

/**
 * Weekly Top Viewed Stores Social Post
 *
 * Fetches the 7 most-visited /best-card-for store pages over the past week
 * (public, visits-only GET /store-event/top), renders a ranking PNG in the
 * social-card design system, and queues it via the Social Posting Service
 * (image attached, link posted as a reply). Sibling of
 * post-weekly-top-cards.js.
 *
 * Usage:
 *   node scripts/post-weekly-top-stores.js [--dry-run] [--fixture <file>] [--out <png>]
 *
 *   --dry-run         render + print, never queue
 *   --fixture <file>  read the store list from a JSON file shaped like the API
 *                     response instead of calling the API (implies --dry-run)
 *   --out <png>       where a dry run writes the image (default: OS temp dir)
 *
 * Env vars: SOCIAL_API_URL, SOCIAL_API_KEY (only needed to queue)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { SO, getTone, escapeXml, soFrame, soFooter, soEyebrow } = require('./lib/og-style');
const { sanitizeSocialText, TWEET_TEXT_LIMIT } = require('./lib/social-text');
const { categoryLabels } = require('../apps/api/src/lib/ranker/categoryLabels');
const storesData = require('../data/stores.json');

const API_BASE = 'https://d2ojrhbh2dincr.cloudfront.net';
const STORES_URL = 'https://creditodds.com/best-card-for';
const TOP_N = 7;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, { maxRetries = 3, baseDelay = 2000 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok || (response.status < 500 && response.status !== 429)) {
      return response;
    }
    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`  Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries}, status ${response.status})...`);
      await sleep(delay);
    } else {
      return response;
    }
  }
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const storeBySlug = new Map((storesData.stores || []).map(s => [s.slug, s]));

// A short category line under the store name. Skips a label that just repeats
// the store name (REI's first category is the REI co-brand category).
function categoryLine(store) {
  const meta = storeBySlug.get(store.slug);
  const labels = (meta?.categories || [])
    .map(id => categoryLabels[id] || id.replace(/_/g, ' '))
    .filter(label => label.toLowerCase() !== store.name.toLowerCase());
  return labels[0] || '';
}

// Hundreds of stores get a handful of visits a week, so last week's rank
// below the top few is mostly the API's alphabetical tie-break. Only show
// movement against a rank that meant something; a climb from further back
// gets no pill rather than a misleading "up 137".
const MOVEMENT_RANK_CUTOFF = 20;

function withMovement(store) {
  const { rank, previous_rank: prev } = store;
  if (!prev) return { ...store, movement: 'new' };
  if (prev > MOVEMENT_RANK_CUTOFF) return { ...store, movement: 'none' };
  if (prev > rank) return { ...store, movement: 'up', movementAmount: prev - rank };
  if (prev < rank) return { ...store, movement: 'down', movementAmount: rank - prev };
  return { ...store, movement: 'same' };
}

async function loadTopStores() {
  const fixture = argValue('--fixture');
  let body;
  if (fixture) {
    body = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  } else {
    // CloudFront caches the API; bust it so the post never shows stale counts.
    const res = await fetchWithRetry(`${API_BASE}/store-event/top?limit=${TOP_N}&_=${Date.now()}`);
    if (!res.ok) throw new Error(`Failed to fetch top stores: ${res.status} ${await res.text()}`);
    body = await res.json();
  }

  const stores = (body.stores || []).slice(0, TOP_N);
  if (stores.length < TOP_N) {
    throw new Error(`Only ${stores.length} stores with visits this week, need ${TOP_N}`);
  }
  return stores.map(s => ({ ...withMovement(s), category: categoryLine(s) }));
}

// ─── Image ───────────────────────────────────────────────────────────────────
//
// Same "T1 Ranking" frame as post-weekly-top-cards.js (1200x630, dot grid,
// tone glow, branded footer). Stores have no art, so each row is: accent bar
// + rank number, store name over a mono category line, a movement pill, and
// the week's view count right-aligned.

const FRAME_W = 1200;
const FRAME_H = 630;
const FOOTER_H = 56;
const PADDING_X = 56;
const CONTENT_TOP = 40;
const TONE = 'purple';

function movementPillSvg(store, rightX, centerY) {
  const t = getTone(TONE);
  const pillH = 22;
  const y = centerY - pillH / 2;

  if (store.movement === 'new') {
    const text = 'NEW';
    const pillW = Math.ceil(text.length * 11 * 0.6) + 20;
    const x = rightX - pillW;
    return `
      <rect x="${x}" y="${y}" width="${pillW}" height="${pillH}" rx="4" ry="4" fill="${SO.accent2}"/>
      <text x="${x + pillW / 2}" y="${y + pillH / 2 + 4}" text-anchor="middle"
            font-family="Menlo,Consolas,monospace" font-size="11" font-weight="600" fill="${t.accent}" letter-spacing="0.8">${text}</text>`;
  }

  if (store.movement === 'up' || store.movement === 'down') {
    const up = store.movement === 'up';
    const text = `${up ? '▲' : '▼'} ${store.movementAmount}`;
    const pillW = Math.ceil(text.length * 12 * 0.6) + 18;
    const x = rightX - pillW;
    return `
      <rect x="${x}" y="${y}" width="${pillW}" height="${pillH}" rx="4" ry="4"
            fill="${up ? 'rgba(62,204,170,0.12)' : 'rgba(255,122,163,0.12)'}"/>
      <text x="${x + pillW / 2}" y="${y + pillH / 2 + 4}" text-anchor="middle"
            font-family="Menlo,Consolas,monospace" font-size="11" font-weight="600" fill="${up ? SO.good : SO.warn}" letter-spacing="0.8">${escapeXml(text)}</text>`;
  }

  return ''; // same rank, or last week's rank was past the cutoff: no pill
}

function fit(text, maxChars) {
  return text.length <= maxChars ? text : text.slice(0, maxChars - 1).trim() + '…';
}

function weekLabel(date) {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

async function generateImage(stores, now = new Date()) {
  const t = getTone(TONE);
  const weekStr = weekLabel(now);
  const rightEdge = FRAME_W - PADDING_X;

  // Header
  const eyebrowY = CONTENT_TOP + 18;
  const titleSize = 44;
  const titleBaseY = eyebrowY + 26 + titleSize - 4;
  const countLabelY = titleBaseY + 22;
  const headerBottom = countLabelY + 16;

  const totalViews = stores.reduce((sum, s) => sum + s.visits, 0);

  // List: evenly spaced rows
  const listTop = headerBottom + 4;
  const listBottom = FRAME_H - FOOTER_H - 8;
  const rowH = (listBottom - listTop) / stores.length;

  const numColW = 44;
  const nameColX = PADDING_X + numColW + 26;
  const viewsRightX = rightEdge;
  const pillRightX = rightEdge - 150;

  let rows = '';
  stores.forEach((store, i) => {
    const yTop = listTop + i * rowH;
    const yCenter = yTop + rowH / 2;
    const first = i === 0;

    if (i > 0) {
      rows += `<line x1="${PADDING_X}" y1="${yTop}" x2="${rightEdge}" y2="${yTop}" stroke="${SO.line}" stroke-width="1"/>`;
    }
    rows += `<rect x="${PADDING_X - 6}" y="${yCenter - 10}" width="3" height="20" rx="2" ry="2" fill="${first ? t.accent : SO.line}"/>`;
    rows += `<text x="${PADDING_X + numColW / 2 + 4}" y="${yCenter + 8}" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="500" fill="${first ? t.accent : SO.muted}" letter-spacing="-0.8">${String(store.rank).padStart(2, '0')}</text>`;

    const nameY = store.category ? yCenter - 3 : yCenter + 7;
    rows += `<text x="${nameColX}" y="${nameY}" font-family="Arial,sans-serif" font-size="20" font-weight="600" fill="${SO.ink}" letter-spacing="-0.3">${escapeXml(fit(store.name, 40))}</text>`;
    if (store.category) {
      rows += `<text x="${nameColX}" y="${yCenter + 15}" font-family="Menlo,Consolas,monospace" font-size="11" fill="${SO.muted}" letter-spacing="0.8">${escapeXml(fit(store.category, 44).toUpperCase())}</text>`;
    }

    rows += movementPillSvg(store, pillRightX, yCenter);

    rows += `<text x="${viewsRightX - 52}" y="${yCenter + 8}" text-anchor="end" font-family="Arial,sans-serif" font-size="24" font-weight="600" fill="${first ? t.accent : SO.ink}" letter-spacing="-0.6">${store.visits.toLocaleString('en-US')}</text>`;
    rows += `<text x="${viewsRightX}" y="${yCenter + 7}" text-anchor="end" font-family="Menlo,Consolas,monospace" font-size="10" font-weight="500" fill="${SO.muted}" letter-spacing="1.4">VIEWS</text>`;
  });

  const frame = soFrame({ width: FRAME_W, height: FRAME_H, tone: TONE });
  const svg = `<svg width="${FRAME_W}" height="${FRAME_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>${frame.defs}</defs>
    ${frame.rects}
    ${soEyebrow({ x: PADDING_X, y: eyebrowY, key: 'Store Rankings', text: `Week of ${weekStr}`, tone: TONE, size: 13 })}
    <text x="${PADDING_X}" y="${titleBaseY}" font-family="Arial,sans-serif" font-size="${titleSize}" font-weight="600" fill="${SO.ink}" letter-spacing="-1.1">Top ${stores.length} Most Viewed Stores</text>
    <text x="${rightEdge}" y="${titleBaseY}" text-anchor="end" font-family="Arial,sans-serif" font-size="44" font-weight="500" fill="${t.accent}" letter-spacing="-1.3">${totalViews.toLocaleString('en-US')}</text>
    <text x="${rightEdge}" y="${countLabelY}" text-anchor="end" font-family="Menlo,Consolas,monospace" font-size="10" font-weight="500" fill="${SO.muted}" letter-spacing="1.4">TOP ${stores.length} COMBINED · VIEWS</text>
    ${rows}
    ${soFooter({ width: FRAME_W, height: FOOTER_H, y: FRAME_H - FOOTER_H, sectionPath: 'best-card-for', tone: TONE })}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ─── Post text ───────────────────────────────────────────────────────────────
//
// House rules: factual, no emoji, no em dashes, fits the 255-char text budget
// (the link goes in a reply). Counts are dropped from the text, never names,
// if the full version would not fit.

function buildPostText(stores) {
  const header = 'Most viewed store pages on CreditOdds this week:';
  const withCounts = stores.map(s => `${s.rank}. ${s.name} (${s.visits.toLocaleString('en-US')})`);
  const namesOnly = stores.map(s => `${s.rank}. ${s.name}`);

  for (const lines of [withCounts, namesOnly]) {
    const text = sanitizeSocialText(`${header}\n\n${lines.join('\n')}`);
    if (text.length <= TWEET_TEXT_LIMIT) return text;
  }
  throw new Error(`Post text exceeds ${TWEET_TEXT_LIMIT} chars even without counts`);
}

function buildLinkUrl(now = new Date()) {
  const url = new URL(STORES_URL);
  url.searchParams.set('utm_source', 'twitter');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'weekly-top-stores');
  url.searchParams.set('utm_content', `weekly-${now.toISOString().slice(0, 10)}`);
  return url.toString();
}

async function queuePost({ text, linkUrl, sourceId, imageBuffer }) {
  const apiUrl = process.env.SOCIAL_API_URL;
  const apiKey = process.env.SOCIAL_API_KEY;
  if (!apiUrl || !apiKey) throw new Error('SOCIAL_API_URL and SOCIAL_API_KEY are required');

  const response = await fetchWithRetry(`${apiUrl}/social/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      text_content: text,
      link_url: linkUrl,
      source_type: 'weekly-top-stores',
      source_id: sourceId,
      // A re-run of the same week's job returns the existing post instead of
      // queueing a duplicate.
      idempotency_key: sourceId,
      image_base64: imageBuffer.toString('base64'),
      image_mime_type: 'image/png',
    }),
  });

  if (!response.ok) {
    throw new Error(`Queue API error: ${response.status} - ${await response.text()}`);
  }
  return response.json();
}

async function main() {
  const fixture = argValue('--fixture');
  const dryRun = process.argv.includes('--dry-run') || Boolean(fixture);
  const now = new Date();

  console.log('=== Weekly Top Viewed Stores ===\n');
  if (fixture) console.log(`[FIXTURE] Using ${fixture}, not live data.\n`);

  const stores = await loadTopStores();
  console.log(`Top ${stores.length} stores by page views (last 7 days):`);
  for (const s of stores) {
    const move = s.movement === 'up' ? `+${s.movementAmount}`
      : s.movement === 'down' ? `-${s.movementAmount}`
      : s.movement === 'new' ? 'NEW'
      : s.movement === 'none' ? `from #${s.previous_rank}, no pill` : 'same';
    console.log(`  #${s.rank} ${s.name} (${s.slug}): ${s.visits} views, ${move}`);
  }

  const imageBuffer = await generateImage(stores, now);
  console.log(`\nImage generated: ${(imageBuffer.length / 1024).toFixed(0)}KB`);

  const text = buildPostText(stores);
  const linkUrl = buildLinkUrl(now);
  const sourceId = `weekly-top-stores-${now.toISOString().slice(0, 10)}`;

  console.log(`\nPost text (${text.length} chars):\n${text}`);
  console.log(`\nLink (posted as reply): ${linkUrl}`);

  if (dryRun) {
    const outPath = argValue('--out') || path.join(os.tmpdir(), 'weekly-top-stores-preview.png');
    fs.writeFileSync(outPath, imageBuffer);
    console.log(`\n[DRY RUN] Image saved to: ${outPath}`);
    console.log('[DRY RUN] Skipping queue.');
    return;
  }

  console.log('\nQueuing post with image via Social Posting Service...');
  const result = await queuePost({ text, linkUrl, sourceId, imageBuffer });
  console.log(`Queued${result.deduped ? ' (already queued for this week, deduped)' : ''}. Post ID: ${result.id}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
