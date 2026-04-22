#!/usr/bin/env node

/**
 * CardWire Social Post — generates an image and queues a Twitter post
 * for each card metric change detected during a card sync.
 *
 * Usage:
 *   node scripts/post-card-wire.js --changes '<JSON>'
 *   node scripts/post-card-wire.js --changes '<JSON>' --dry-run
 *
 * The --changes JSON is the wire_changes array from the /sync-cards response:
 *   [{ "card": "Chase Sapphire Preferred", "changes": [{ "field": "annual_fee", "old_value": "95", "new_value": "250" }] }]
 *
 * Env vars: SOCIAL_API_URL, SOCIAL_API_KEY
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { V2, darkBackground, footerBar, hexToRgba } = require('./lib/og-style');

const API_BASE = 'https://d2ojrhbh2dincr.cloudfront.net';
const CDN_IMAGES = 'https://d3ay3etzd1512y.cloudfront.net/card_images';

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
      console.log(`  Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(delay);
    } else {
      return response;
    }
  }
}

// ── Formatting helpers (mirrors CardWireTable.tsx logic) ──

const fieldLabels = {
  accepting_applications: 'Applications',
  annual_fee: 'Annual Fee',
  signup_bonus_value: 'Sign-up Bonus',
  reward_top_rate: 'Top Reward Rate',
  apr_min: 'APR Min',
  apr_max: 'APR Max',
};

const higherIsBad = new Set(['annual_fee', 'apr_min', 'apr_max']);

function formatValue(field, value) {
  if (value === null || value === '') return '\u2014';
  const num = parseFloat(value);
  if (field === 'accepting_applications') {
    if (value === '1' || value === 'true') return 'Accepting';
    if (value === '0' || value === 'false') return 'No longer accepting';
    return value;
  }
  if (field === 'annual_fee') {
    return !isNaN(num) ? (num === 0 ? '$0' : `$${num.toLocaleString()}`) : value;
  }
  if (field === 'signup_bonus_value') {
    return !isNaN(num) ? `${num.toLocaleString()} pts` : value;
  }
  if (field === 'reward_top_rate' || field === 'apr_min' || field === 'apr_max') {
    return !isNaN(num) ? `${num}%` : value;
  }
  return value;
}

function getDirection(field, oldValue, newValue) {
  const oldNum = parseFloat(oldValue);
  const newNum = parseFloat(newValue);
  if (isNaN(oldNum) || isNaN(newNum)) return 'neutral';
  if (oldNum === newNum) return 'neutral';
  const increased = newNum > oldNum;
  if (higherIsBad.has(field)) return increased ? 'negative' : 'positive';
  return increased ? 'positive' : 'negative';
}

// ── Card data lookup ──

let _cardCache = null;
async function getCardByName(cardName) {
  if (!_cardCache) {
    const res = await fetch(`${API_BASE}/cards`);
    if (!res.ok) throw new Error(`Failed to fetch cards: ${res.status}`);
    _cardCache = await res.json();
  }
  return _cardCache.find(c => (c.card_name || c.name) === cardName) || null;
}

async function fetchCardImage(imageFilename) {
  try {
    const url = `${CDN_IMAGES}/${imageFilename}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return await sharp(buffer)
      .resize(280, 176, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

// ── Image generation ──

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function generateCardWireImage(cardName, bank, changes, cardImageBuffer) {
  const width = 1080;
  const headerHeight = 100;
  const cardImageAreaHeight = 200;
  const changeRowHeight = 100;
  const footerHeight = 50;
  const changesHeight = changes.length * changeRowHeight + 40; // 40 for section header
  const height = headerHeight + cardImageAreaHeight + changesHeight + footerHeight;

  // Build change rows
  let changesSvg = '';
  const changesStartY = headerHeight + cardImageAreaHeight + 40; // after section header

  // Section header
  const sectionHeaderY = headerHeight + cardImageAreaHeight;
  changesSvg += `
    <text x="40" y="${sectionHeaderY + 26}" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="${V2.accent}" letter-spacing="1.5">WHAT CHANGED</text>
  `;

  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    const y = changesStartY + (i * changeRowHeight);
    const dir = getDirection(c.field, c.old_value, c.new_value);
    const label = fieldLabels[c.field] || c.field;
    const oldFormatted = formatValue(c.field, c.old_value);
    const newFormatted = formatValue(c.field, c.new_value);

    const accentColor = dir === 'positive' ? V2.emerald : dir === 'negative' ? V2.warn : V2.muted;
    const rowBg = dir === 'positive'
      ? hexToRgba(V2.emerald, 0.12)
      : dir === 'negative'
      ? hexToRgba(V2.warn, 0.14)
      : 'rgba(255,255,255,0.05)';
    const pillBg = dir === 'positive'
      ? hexToRgba(V2.emerald, 0.22)
      : dir === 'negative'
      ? hexToRgba(V2.warn, 0.22)
      : 'rgba(255,255,255,0.12)';

    // Row background
    changesSvg += `<rect x="30" y="${y}" width="${width - 60}" height="${changeRowHeight - 10}" rx="12" fill="${rowBg}" stroke="${hexToRgba(accentColor, 0.3)}" stroke-width="1"/>`;

    // Field label
    changesSvg += `<text x="55" y="${y + 35}" font-family="Arial,sans-serif" font-size="18" font-weight="bold" fill="#ffffff">${escapeXml(label)}</text>`;

    // Old value → New value
    changesSvg += `<text x="55" y="${y + 62}" font-family="Arial,sans-serif" font-size="22" fill="rgba(255,255,255,0.5)">${escapeXml(oldFormatted)}</text>`;
    changesSvg += `<text x="${55 + oldFormatted.length * 13 + 15}" y="${y + 62}" font-family="Arial,sans-serif" font-size="22" fill="rgba(255,255,255,0.5)">\u2192</text>`;
    changesSvg += `<text x="${55 + oldFormatted.length * 13 + 40}" y="${y + 62}" font-family="Arial,sans-serif" font-size="22" font-weight="bold" fill="${accentColor}">${escapeXml(newFormatted)}</text>`;

    // Direction badge on right
    const badgeText = dir === 'positive' ? '\u2B06 Better' : dir === 'negative' ? '\u2B07 Worse' : '\u2796 Changed';
    changesSvg += `
      <rect x="${width - 195}" y="${y + 25}" width="130" height="36" rx="18" fill="${pillBg}"/>
      <text x="${width - 130}" y="${y + 49}" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" font-weight="bold" fill="${accentColor}">${badgeText}</text>
    `;
  }

  // Header accent color based on overall sentiment
  const allPositive = changes.every(c => getDirection(c.field, c.old_value, c.new_value) === 'positive');
  const allNegative = changes.every(c => getDirection(c.field, c.old_value, c.new_value) === 'negative');
  const accentColor = allPositive ? V2.emerald : allNegative ? V2.warn : V2.accent;

  const bg = darkBackground({ width, height, accent: accentColor });

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${bg.defs}
    </defs>
    ${bg.rects}

    <!-- Accent bar above title -->
    <rect x="40" y="32" width="60" height="3" fill="${accentColor}"/>

    <!-- Header -->
    <text x="40" y="66" font-family="Arial,sans-serif" font-size="32" font-weight="bold" fill="#ffffff" letter-spacing="-0.5">${escapeXml(cardName)}</text>
    <text x="40" y="92" font-family="Arial,sans-serif" font-size="16" fill="${accentColor}" letter-spacing="1.2">${escapeXml((bank || '').toUpperCase())} \u00B7 CARDWIRE UPDATE</text>

    <!-- Card image area (darker inset) -->
    <rect x="0" y="${headerHeight}" width="${width}" height="${cardImageAreaHeight}" fill="rgba(0,0,0,0.18)"/>

    <!-- Changes -->
    ${changesSvg}

    <!-- Footer -->
    ${footerBar({ width, y: height - footerHeight, height: footerHeight, text: 'creditodds.com/card-wire' })}
  </svg>`;

  let image = sharp(Buffer.from(svg)).png();

  // Overlay card image centered in the card image area
  if (cardImageBuffer) {
    const imgTop = headerHeight + Math.round((cardImageAreaHeight - 176) / 2);
    image = sharp(await image.toBuffer()).composite([{
      input: cardImageBuffer,
      left: Math.round((width - 280) / 2),
      top: imgTop,
    }]).png();
  }

  return image.toBuffer();
}

// ── Tweet text ──

function buildTweetText(cardName, changes) {
  const parts = changes.map(c => {
    const label = fieldLabels[c.field] || c.field;
    const dir = getDirection(c.field, c.old_value, c.new_value);
    const arrow = dir === 'positive' ? '\u2B06\uFE0F' : dir === 'negative' ? '\u2B07\uFE0F' : '\u2796';
    const oldF = formatValue(c.field, c.old_value);
    const newF = formatValue(c.field, c.new_value);
    return `${arrow} ${label}: ${oldF} \u2192 ${newF}`;
  });

  let text = `CardWire Update: ${cardName}\n\n${parts.join('\n')}`;
  if (text.length > 270) {
    text = text.substring(0, 267) + '...';
  }
  return text;
}

function buildLinkUrl(slug) {
  const url = new URL(`https://creditodds.com/card/${slug}`);
  url.searchParams.set('utm_source', 'twitter');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'card-wire');
  return url.toString();
}

// ── Social API queue ──

async function queuePost(textContent, linkUrl, sourceId, imageBuffer) {
  const apiUrl = process.env.SOCIAL_API_URL;
  const apiKey = process.env.SOCIAL_API_KEY;
  if (!apiUrl || !apiKey) throw new Error('SOCIAL_API_URL and SOCIAL_API_KEY are required');

  const body = {
    text_content: textContent,
    link_url: linkUrl,
    source_type: 'card-wire',
    source_id: sourceId,
    platforms: ['twitter'],
  };

  if (imageBuffer) {
    body.image_base64 = imageBuffer.toString('base64');
    body.image_mime_type = 'image/png';
  }

  const response = await fetchWithRetry(`${apiUrl}/social/queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Queue API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// ── Main ──

function parseArgs() {
  const args = process.argv.slice(2);
  let changesJson = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--changes' && args[i + 1]) {
      changesJson = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  if (!changesJson) {
    console.error('Usage: node scripts/post-card-wire.js --changes \'<JSON>\' [--dry-run]');
    process.exit(1);
  }

  let changes;
  try {
    changes = JSON.parse(changesJson);
  } catch (err) {
    console.error('Failed to parse --changes JSON:', err.message);
    process.exit(1);
  }

  return { changes, dryRun };
}

async function main() {
  const { changes, dryRun } = parseArgs();

  if (!changes || changes.length === 0) {
    console.log('No wire changes to post.');
    return;
  }

  console.log(`=== CardWire Social Posts ===\n`);
  console.log(`${changes.length} card(s) with changes\n`);

  for (const entry of changes) {
    const cardName = entry.card;
    const cardChanges = entry.changes;

    console.log(`Processing: ${cardName} (${cardChanges.length} change(s))`);

    // Look up card data for image + slug
    const card = await getCardByName(cardName);
    const slug = card?.slug || card?.card_id || cardName.toLowerCase().replace(/\s+/g, '-');
    const bank = card?.bank || '';

    // Fetch card image
    let cardImageBuffer = null;
    if (card?.card_image_link) {
      cardImageBuffer = await fetchCardImage(card.card_image_link);
    }

    // Generate image
    const imageBuffer = await generateCardWireImage(cardName, bank, cardChanges, cardImageBuffer);
    console.log(`  Image: ${(imageBuffer.length / 1024).toFixed(0)}KB`);

    // Build post text
    const tweetText = buildTweetText(cardName, cardChanges);
    const linkUrl = buildLinkUrl(slug);
    const sourceId = `wire-${slug}-${new Date().toISOString().slice(0, 10)}`;

    console.log(`  Text (${tweetText.length} chars): ${tweetText.replace(/\n/g, ' | ')}`);

    if (dryRun) {
      const outPath = path.join(__dirname, '..', `card-wire-preview-${slug}.png`);
      fs.writeFileSync(outPath, imageBuffer);
      console.log(`  [DRY RUN] Image saved to: ${outPath}\n`);
      continue;
    }

    try {
      const result = await queuePost(tweetText, linkUrl, sourceId, imageBuffer);
      console.log(`  Queued! Post ID: ${result.id}\n`);
    } catch (err) {
      console.error(`  Failed to queue: ${err.message}\n`);
    }
  }

  console.log('=== Done ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
