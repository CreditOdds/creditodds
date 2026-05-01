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
const {
  SO,
  getTone,
  escapeXml,
  soFrame,
  soFooter,
  soEyebrow,
} = require('./lib/og-style');
const { appendBankHandles } = require('./lib/bank-handles');

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
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// ── Image generation ──
//
// Layout follows the "T2 — CardWire" template in the design system:
//   1200×630 frame, dot-grid + tone-tinted glow backdrop, hairline accent at top.
//   Left column: eyebrow + card name title + "What changed" stat block (single
//   primary change, with "+N more" badge if multiple). Right column: tilted
//   card art with a back-glow placeholder card behind.

const FRAME_W = 1200;
const FRAME_H = 630;
const FOOTER_H = 56;
const CONTENT_TOP = 40;
const PADDING_X = 56;
const COL_GAP = 36;
const RIGHT_COL_W = 420;
const CARD_ART_W = 360;
const CARD_ART_H = Math.round(CARD_ART_W / 1.6);

// Pick the most-noteworthy change (positive/negative beats neutral; first wins ties)
function pickPrimaryChange(changes) {
  const ranked = changes.map((c, i) => ({
    c,
    dir: getDirection(c.field, c.old_value, c.new_value),
    idx: i,
  }));
  ranked.sort((a, b) => {
    const aScore = a.dir === 'neutral' ? 1 : 0;
    const bScore = b.dir === 'neutral' ? 1 : 0;
    if (aScore !== bScore) return aScore - bScore;
    return a.idx - b.idx;
  });
  return { primary: ranked[0], rest: ranked.slice(1) };
}

function overallTone(changes) {
  const allPositive = changes.every(c => getDirection(c.field, c.old_value, c.new_value) === 'positive');
  const allNegative = changes.every(c => getDirection(c.field, c.old_value, c.new_value) === 'negative');
  if (allPositive) return 'good';
  if (allNegative) return 'warn';
  return 'purple';
}

function eyebrowVerb(tone) {
  return tone === 'good' ? 'CardWire · improvement'
       : tone === 'warn' ? 'CardWire · downgrade'
       :                   'CardWire · update';
}

// Word-wrap a string into up to maxLines lines of approximately maxChars each.
function wrapText(text, maxChars, maxLines) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) { current = word; continue; }
    if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      if (lines.length >= maxLines) break;
      current = word;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  // Tail truncation if we overflowed
  if (lines.length === maxLines) {
    const used = lines.join(' ');
    if (used.length < text.length - 2) {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] = (last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last) + '…';
    }
  }
  return lines.length ? lines : [text];
}

function estimateMonoWidth(s, fontSize) {
  return Math.ceil(String(s).length * fontSize * 0.6);
}

// Render the card image inside a tilted, rounded frame with a soft drop shadow.
// Returns { buffer, width, height } for compositing onto the main canvas.
async function renderTiltedCardArt(cardImageBuffer) {
  const innerW = CARD_ART_W;
  const innerH = CARD_ART_H;

  // Inner card frame: rounded background with the issuer image centered inside
  const innerSvg = `<svg width="${innerW}" height="${innerH}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${innerW}" height="${innerH}" rx="14" ry="14" fill="${SO.card2}"/>
  </svg>`;
  let inner = sharp(Buffer.from(innerSvg)).png();

  if (cardImageBuffer) {
    const padding = 18;
    const fitted = await sharp(cardImageBuffer)
      .resize(innerW - padding * 2, innerH - padding * 2, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    inner = sharp(await inner.toBuffer()).composite([{ input: fitted, left: padding, top: padding }]).png();
  }

  // Subtle gloss + 1px inner border to match `.so-cardart::after`
  const glossSvg = `<svg width="${innerW}" height="${innerH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gloss" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.10)"/>
        <stop offset="35%" stop-color="rgba(255,255,255,0)"/>
        <stop offset="65%" stop-color="rgba(255,255,255,0)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.04)"/>
      </linearGradient>
      <clipPath id="round"><rect x="0" y="0" width="${innerW}" height="${innerH}" rx="14" ry="14"/></clipPath>
    </defs>
    <g clip-path="url(#round)">
      <rect x="0" y="0" width="${innerW}" height="${innerH}" fill="url(#gloss)"/>
    </g>
    <rect x="0.5" y="0.5" width="${innerW - 1}" height="${innerH - 1}" rx="14" ry="14" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  </svg>`;
  inner = sharp(await inner.toBuffer()).composite([{ input: Buffer.from(glossSvg), left: 0, top: 0 }]).png();

  // Pad onto a transparent canvas large enough to fit -3deg rotation and shadow
  const padW = 480;
  const padH = 320;
  const offsetX = Math.round((padW - innerW) / 2);
  const offsetY = Math.round((padH - innerH) / 2);
  const canvasSvg = `<svg width="${padW}" height="${padH}" xmlns="http://www.w3.org/2000/svg"></svg>`;
  let padded = sharp(Buffer.from(canvasSvg)).composite([{ input: await inner.toBuffer(), left: offsetX, top: offsetY }]).png();

  // Rotate -3deg (canvas auto-expands to fit)
  const rotated = await sharp(await padded.toBuffer())
    .rotate(-3, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const rotMeta = await sharp(rotated).metadata();

  // Approximate drop shadow: blur the alpha channel and use it as the alpha
  // of a black layer (scaled down so the shadow is soft, not a solid box).
  const alphaBlur = await sharp(rotated)
    .extractChannel('alpha')
    .blur(22)
    .linear(0.55, 0)
    .toBuffer();
  const shadow = await sharp({
    create: {
      width: rotMeta.width,
      height: rotMeta.height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .joinChannel(alphaBlur)
    .png()
    .toBuffer();

  const finalH = rotMeta.height + 14;
  const finalCanvasSvg = `<svg width="${rotMeta.width}" height="${finalH}" xmlns="http://www.w3.org/2000/svg"></svg>`;
  const finalImg = await sharp(Buffer.from(finalCanvasSvg))
    .composite([
      { input: shadow, left: 0, top: 14 },
      { input: rotated, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  return { buffer: finalImg, width: rotMeta.width, height: finalH };
}

async function generateCardWireImage(cardName, bank, changes, cardImageBuffer, timestamp = 'Just now') {
  const tone = overallTone(changes);
  const t = getTone(tone);
  const { primary, rest } = pickPrimaryChange(changes);

  const dir = primary.dir;
  const fieldLabel = fieldLabels[primary.c.field] || primary.c.field;
  const oldFormatted = formatValue(primary.c.field, primary.c.old_value);
  const newFormatted = formatValue(primary.c.field, primary.c.new_value);

  const pillText = dir === 'positive' ? '↑ BETTER'
                 : dir === 'negative' ? '↓ WORSE'
                 : '• CHANGED';
  const pillColor = dir === 'positive' ? SO.good
                  : dir === 'negative' ? SO.warn
                  : SO.accent;
  const pillBg = dir === 'positive' ? 'rgba(62,204,170,0.12)'
               : dir === 'negative' ? 'rgba(255,122,163,0.12)'
               : 'rgba(183,148,255,0.12)';
  const toColor = dir === 'positive' ? SO.good
                : dir === 'negative' ? SO.warn
                : SO.accent;

  // ── Layout coords (left text column + right card art column) ──
  const leftX = PADDING_X;
  const leftColW = FRAME_W - PADDING_X * 2 - RIGHT_COL_W - COL_GAP;
  const rightColX = PADDING_X + leftColW + COL_GAP;

  const eyebrowY = CONTENT_TOP + 20;
  const titleSize = 60;
  const titleLineH = Math.round(titleSize * 1.05);
  const titleLines = wrapText(cardName, 18, 2);
  const titleBaseY = eyebrowY + 30 + titleSize - 4;
  const issuerLabelY = titleBaseY + (titleLines.length - 1) * titleLineH + 30;

  const changeBlockH = 168;
  const remainingTop = issuerLabelY + 12;
  const remainingBottom = FRAME_H - FOOTER_H - 16;
  const changeBlockY = Math.round(remainingTop + (remainingBottom - remainingTop - changeBlockH) / 2);

  // ── Build SVG ──
  const frame = soFrame({ width: FRAME_W, height: FRAME_H, tone });

  const eyebrowSvg = soEyebrow({
    x: leftX,
    y: eyebrowY,
    key: (bank || 'CARD').toUpperCase(),
    text: eyebrowVerb(tone),
    tone,
    size: 16,
  });

  const titleSvg = titleLines.map((line, i) => `
    <text x="${leftX}" y="${titleBaseY + i * titleLineH}" font-family="Arial,sans-serif" font-size="${titleSize}" font-weight="600" fill="${SO.ink}" letter-spacing="-1.2">${escapeXml(line)}</text>
  `).join('');

  // "What changed" block (`.so-change` in design)
  const blockX = leftX;
  const blockW = leftColW;
  const accentBarW = 3;

  const pillW = 134;
  const pillH = 38;
  const pillX = blockX + blockW - 24 - pillW;
  const pillY = changeBlockY + 24;

  const valueY = changeBlockY + changeBlockH - 36;
  const valueSize = 40;
  const fromX = blockX + 24;
  const fromW = estimateMonoWidth(oldFormatted, valueSize);
  const arrowX = fromX + fromW + 18;
  const arrowW = estimateMonoWidth('→', valueSize - 2);
  const toX = arrowX + arrowW + 18;
  const fromCenterY = valueY - Math.round(valueSize * 0.32);

  const changeBlockSvg = `
    <rect x="${blockX}" y="${changeBlockY}" width="${blockW}" height="${changeBlockH}" rx="12" ry="12"
          fill="${SO.card2}" stroke="${SO.line}" stroke-width="1"/>
    <rect x="${blockX}" y="${changeBlockY}" width="${blockW}" height="${changeBlockH}" rx="12" ry="12"
          fill="rgba(0,0,0,0.18)"/>
    <rect x="${blockX}" y="${changeBlockY + 12}" width="${accentBarW}" height="${changeBlockH - 24}" rx="2" ry="2" fill="${t.hair}"/>

    <text x="${blockX + 24}" y="${changeBlockY + 36}" font-family="Menlo,Consolas,monospace" font-size="14" fill="${SO.muted}" letter-spacing="1.4" font-weight="500">WHAT CHANGED${rest.length ? `  ·  +${rest.length} MORE` : ''}</text>

    <text x="${blockX + 24}" y="${changeBlockY + 74}" font-family="Arial,sans-serif" font-size="26" font-weight="600" fill="${SO.ink}" letter-spacing="-0.3">${escapeXml(fieldLabel)}</text>

    <text x="${fromX}" y="${valueY}" font-family="Menlo,Consolas,monospace" font-size="${valueSize}" font-weight="500" fill="${SO.muted}" letter-spacing="-0.3">${escapeXml(oldFormatted)}</text>
    <line x1="${fromX}" y1="${fromCenterY}" x2="${fromX + fromW}" y2="${fromCenterY}" stroke="${SO.muted2}" stroke-width="2"/>
    <text x="${arrowX}" y="${valueY}" font-family="Menlo,Consolas,monospace" font-size="${valueSize - 2}" fill="${SO.muted2}">→</text>
    <text x="${toX}" y="${valueY}" font-family="Menlo,Consolas,monospace" font-size="${valueSize}" font-weight="500" fill="${toColor}" letter-spacing="-0.3">${escapeXml(newFormatted)}</text>

    <rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" ry="${pillH / 2}"
          fill="${pillBg}" stroke="${pillColor}" stroke-width="1"/>
    <text x="${pillX + pillW / 2}" y="${pillY + pillH / 2 + 5}" text-anchor="middle"
          font-family="Menlo,Consolas,monospace" font-size="14" font-weight="600" fill="${pillColor}" letter-spacing="0.8">${pillText}</text>
  `;

  // Right column: decorative back-glow card behind the foreground card art
  const rightColCenterX = rightColX + RIGHT_COL_W / 2;
  const rightColCenterY = CONTENT_TOP + (FRAME_H - FOOTER_H - CONTENT_TOP) / 2;
  const backGlowW = 340;
  const backGlowH = Math.round(backGlowW / 1.6);
  const backGlowX = rightColCenterX - backGlowW / 2 + 20;
  const backGlowY = rightColCenterY - backGlowH / 2 - 10;

  const backGlowSvg = `
    <defs>
      <linearGradient id="backGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="rgba(183,148,255,0.18)"/>
        <stop offset="100%" stop-color="rgba(109,63,232,0.06)"/>
      </linearGradient>
    </defs>
    <g transform="rotate(6 ${backGlowX + backGlowW / 2} ${backGlowY + backGlowH / 2})">
      <rect x="${backGlowX}" y="${backGlowY}" width="${backGlowW}" height="${backGlowH}" rx="14" ry="14"
            fill="url(#backGlowGrad)" stroke="${SO.line}" stroke-width="1"/>
    </g>
  `;

  const footerSvg = soFooter({
    width: FRAME_W,
    height: FOOTER_H,
    y: FRAME_H - FOOTER_H,
    sectionPath: 'card-wire',
    meta: timestamp,
    tone,
  });

  const svg = `<svg width="${FRAME_W}" height="${FRAME_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${frame.defs}
    </defs>
    ${frame.rects}

    ${eyebrowSvg}
    ${titleSvg}

    <text x="${leftX}" y="${issuerLabelY - 4}" font-family="Menlo,Consolas,monospace" font-size="16" fill="${SO.muted}" letter-spacing="1.4">${escapeXml(bank ? bank.toUpperCase() : '')}</text>

    ${changeBlockSvg}

    ${backGlowSvg}

    ${footerSvg}
  </svg>`;

  let image = sharp(Buffer.from(svg)).png();

  // Composite the tilted card art on top of the back-glow rect
  const cardArt = await renderTiltedCardArt(cardImageBuffer);
  const cardLeft = Math.round(rightColCenterX - cardArt.width / 2);
  const cardTop = Math.round(rightColCenterY - cardArt.height / 2);
  image = sharp(await image.toBuffer()).composite([{
    input: cardArt.buffer,
    left: cardLeft,
    top: cardTop,
  }]).png();

  return image.toBuffer();
}


// ── Tweet text ──

function buildPostText(cardName, changes, bank) {
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
  const withHandles = appendBankHandles(text, bank ? [bank] : [], 280);
  return {
    textContent: text,
    twitterText: withHandles !== text ? withHandles : null,
  };
}

function buildLinkUrl(slug) {
  const url = new URL(`https://creditodds.com/card/${slug}`);
  url.searchParams.set('utm_source', 'twitter');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'card-wire');
  return url.toString();
}

// ── Social API queue ──

async function queuePost(textContent, twitterText, linkUrl, sourceId, imageBuffer) {
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
  if (twitterText && twitterText !== textContent) {
    body.twitter_text = twitterText;
  }

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
    const { textContent, twitterText } = buildPostText(cardName, cardChanges, bank);
    const linkUrl = buildLinkUrl(slug);
    const sourceId = `wire-${slug}-${new Date().toISOString().slice(0, 10)}`;

    console.log(`  Text (${textContent.length} chars): ${textContent.replace(/\n/g, ' | ')}`);
    if (twitterText) {
      console.log(`  Twitter variant (${twitterText.length} chars): ${twitterText.replace(/\n/g, ' | ')}`);
    }

    if (dryRun) {
      const outPath = path.join(__dirname, '..', `card-wire-preview-${slug}.png`);
      fs.writeFileSync(outPath, imageBuffer);
      console.log(`  [DRY RUN] Image saved to: ${outPath}\n`);
      continue;
    }

    try {
      const result = await queuePost(textContent, twitterText, linkUrl, sourceId, imageBuffer);
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
