#!/usr/bin/env node

/**
 * Weekly Top Viewed Cards Social Post
 *
 * Fetches the top 5 most viewed cards from the past week, generates a
 * "power rankings" PNG image with card images/names/rank movement,
 * and queues it via the Social Posting Service (which posts to all
 * platforms with the image attached and URL as a reply).
 *
 * Usage: node scripts/post-weekly-top-cards.js [--dry-run]
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
const EXPLORE_URL = 'https://creditodds.com/explore';

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

async function fetchTopCards() {
  // Fetch 7-day and 14-day views to compute this week vs last week
  const [views7Res, views14Res, cardsRes] = await Promise.all([
    fetch(`${API_BASE}/card-view?period=7`),
    fetch(`${API_BASE}/card-view?period=14`),
    fetch(`${API_BASE}/cards`),
  ]);

  if (!views7Res.ok) throw new Error(`Failed to fetch 7d views: ${views7Res.status}`);
  if (!views14Res.ok) throw new Error(`Failed to fetch 14d views: ${views14Res.status}`);
  if (!cardsRes.ok) throw new Error(`Failed to fetch cards: ${cardsRes.status}`);

  const { views: views7 } = await views7Res.json();
  const { views: views14 } = await views14Res.json();
  const cards = await cardsRes.json();

  // Build lookup: numeric db_card_id -> card info
  const cardById = {};
  for (const card of cards) {
    if (card.db_card_id) {
      cardById[card.db_card_id] = {
        name: card.card_name || card.name,
        image: card.card_image_link,
        slug: card.slug || card.card_id,
        bank: card.bank,
      };
    }
  }

  // Compute last week views = 14d - 7d
  const lastWeekViews = {};
  for (const [id, count14] of Object.entries(views14)) {
    const count7 = views7[id] || 0;
    lastWeekViews[id] = count14 - count7;
  }

  // Last week's ranking (for movement comparison)
  const lastWeekRanked = Object.entries(lastWeekViews)
    .filter(([id]) => cardById[Number(id)])
    .sort((a, b) => b[1] - a[1]);
  const lastWeekRankMap = {};
  lastWeekRanked.forEach(([id], i) => { lastWeekRankMap[Number(id)] = i + 1; });

  // This week's top 5
  const thisWeek = Object.entries(views7)
    .map(([id, count]) => ({
      id: Number(id),
      count,
      ...cardById[Number(id)],
    }))
    .filter(entry => entry.name)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (thisWeek.length < 5) {
    throw new Error(`Only found ${thisWeek.length} cards with views — need at least 5`);
  }

  // Add movement info
  for (let i = 0; i < thisWeek.length; i++) {
    const card = thisWeek[i];
    const currentRank = i + 1;
    const previousRank = lastWeekRankMap[card.id];
    if (!previousRank) {
      card.movement = 'new';
    } else if (previousRank > currentRank) {
      card.movement = 'up';
      card.movementAmount = previousRank - currentRank;
    } else if (previousRank < currentRank) {
      card.movement = 'down';
      card.movementAmount = currentRank - previousRank;
    } else {
      card.movement = 'same';
    }
    card.rank = currentRank;
  }

  return thisWeek;
}

// ─── Image generation ────────────────────────────────────────────────────────
//
// Layout follows the "T1 — Ranking" template in the design system, matching
// post-best-rankings.js: 1200×630 frame, dot-grid + tone-tinted glow backdrop,
// hairline accent at top. Header row: eyebrow + title on the left, count +
// "Most viewed" on the right. List: 5 evenly-spaced rows with rank num
// (vertical accent bar + "01"), small card art (1.6:1), name + issuer, and a
// movement pill on the right.

const FRAME_W = 1200;
const FRAME_H = 630;
const FOOTER_H = 56;
const PADDING_X = 56;
const CONTENT_TOP = 40;

const RANK_ART_W = 86;
const RANK_ART_H = Math.round(RANK_ART_W / 1.6); // 54

const TONE = 'purple';

async function fetchCardImage(imageFilename) {
  try {
    const url = `${CDN_IMAGES}/${imageFilename}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const inner = await sharp(buffer)
      .resize(RANK_ART_W - 6, RANK_ART_H - 6, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    const slotSvg = `<svg width="${RANK_ART_W}" height="${RANK_ART_H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${RANK_ART_W}" height="${RANK_ART_H}" rx="6" ry="6" fill="${SO.card2}"/>
    </svg>`;
    return await sharp(Buffer.from(slotSvg))
      .composite([
        { input: inner, left: 3, top: 3 },
        {
          input: Buffer.from(`<svg width="${RANK_ART_W}" height="${RANK_ART_H}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="${RANK_ART_W - 1}" height="${RANK_ART_H - 1}" rx="6" ry="6" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
          </svg>`),
          left: 0, top: 0,
        },
      ])
      .png()
      .toBuffer();
  } catch (err) {
    console.log(`  Warning: failed to fetch image ${imageFilename}: ${err.message}`);
    return null;
  }
}

function getMovementPillSvg(card, tone, rightX, centerY) {
  const t = getTone(tone);

  if (card.movement === 'new') {
    const text = 'NEW';
    const textW = Math.ceil(text.length * 11 * 0.6);
    const pillW = textW + 20;
    const pillH = 22;
    const x = rightX - pillW;
    const y = centerY - pillH / 2;
    return `
      <rect x="${x}" y="${y}" width="${pillW}" height="${pillH}" rx="4" ry="4" fill="${SO.accent2}" stroke="none"/>
      <text x="${x + pillW / 2}" y="${y + pillH / 2 + 4}" text-anchor="middle"
            font-family="Menlo,Consolas,monospace" font-size="11" font-weight="600" fill="${t.accent}" letter-spacing="0.8">${text}</text>
    `;
  }

  if (card.movement === 'up' || card.movement === 'down') {
    const positive = card.movement === 'up';
    const color = positive ? SO.good : SO.warn;
    const arrow = positive ? '▲' : '▼';
    const text = `${arrow} ${card.movementAmount}`;
    const textW = Math.ceil(text.length * 12 * 0.6);
    const pillW = textW + 18;
    const pillH = 22;
    const x = rightX - pillW;
    const y = centerY - pillH / 2;
    return `
      <rect x="${x}" y="${y}" width="${pillW}" height="${pillH}" rx="4" ry="4"
            fill="${positive ? 'rgba(62,204,170,0.12)' : 'rgba(255,122,163,0.12)'}" stroke="none"/>
      <text x="${x + pillW / 2}" y="${y + pillH / 2 + 4}" text-anchor="middle"
            font-family="Menlo,Consolas,monospace" font-size="11" font-weight="600" fill="${color}" letter-spacing="0.8">${escapeXml(text)}</text>
    `;
  }

  // 'same' — no pill
  return '';
}

function fitName(name, maxChars) {
  if (name.length <= maxChars) return name;
  return name.slice(0, maxChars - 1).trim() + '…';
}

async function generateRankingsImage(topCards) {
  const tone = TONE;
  const t = getTone(tone);

  const cardImages = await Promise.all(
    topCards.map(card => card.image ? fetchCardImage(card.image) : Promise.resolve(null))
  );

  const now = new Date();
  const weekStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // ── Header layout ──
  const eyebrowY = CONTENT_TOP + 18;
  const titleSize = 44;
  const titleBaseY = eyebrowY + 26 + titleSize - 4;

  const countSize = 44;
  const rightEdge = FRAME_W - PADDING_X;
  const countText = String(topCards.length);
  const countBaseY = titleBaseY;
  const countLabelY = countBaseY + 22;
  const headerBottom = countLabelY + 16;

  // ── List layout: evenly-spaced rows ──
  const listTop = headerBottom + 8;
  const listBottom = FRAME_H - FOOTER_H - 12;
  const listH = listBottom - listTop;
  const numRows = topCards.length;
  const rowH = listH / numRows;

  const numColW = 44;
  const numColX = PADDING_X;
  const artColX = numColX + numColW + 18;
  const nameColX = artColX + RANK_ART_W + 18;

  const frame = soFrame({ width: FRAME_W, height: FRAME_H, tone });

  const eyebrowSvg = soEyebrow({
    x: PADDING_X,
    y: eyebrowY,
    key: 'Power Rankings',
    text: `Week of ${weekStr}`,
    tone,
    size: 13,
  });

  const titleSvg = `
    <text x="${PADDING_X}" y="${titleBaseY}" font-family="Arial,sans-serif" font-size="${titleSize}" font-weight="600" fill="${SO.ink}" letter-spacing="-1.1">Top 5 Most Viewed</text>
  `;

  const countCluster = `
    <text x="${rightEdge}" y="${countBaseY}" text-anchor="end" font-family="Arial,sans-serif" font-size="${countSize}" font-weight="500" fill="${t.accent}" letter-spacing="-1.3">${countText}</text>
    <text x="${rightEdge}" y="${countLabelY}" text-anchor="end" font-family="Menlo,Consolas,monospace" font-size="10" font-weight="500" fill="${SO.muted}" letter-spacing="1.4">MOST VIEWED</text>
  `;

  let rowsSvg = '';
  for (let i = 0; i < numRows; i++) {
    const card = topCards[i];
    const yTop = listTop + i * rowH;
    const yCenter = yTop + rowH / 2;
    const isFirst = i === 0;
    const numColor = isFirst ? t.accent : SO.muted;
    const barColor = isFirst ? t.accent : SO.line;

    if (i > 0) {
      rowsSvg += `<line x1="${PADDING_X}" y1="${yTop}" x2="${FRAME_W - PADDING_X}" y2="${yTop}" stroke="${SO.line}" stroke-width="1"/>`;
    }

    rowsSvg += `<rect x="${PADDING_X - 6}" y="${yCenter - 11}" width="3" height="22" rx="2" ry="2" fill="${barColor}"/>`;
    const numText = String(i + 1).padStart(2, '0');
    rowsSvg += `<text x="${numColX + numColW / 2 + 4}" y="${yCenter + 9}" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" font-weight="500" fill="${numColor}" letter-spacing="-0.8">${numText}</text>`;

    const artY = yCenter - RANK_ART_H / 2;
    rowsSvg += `<rect x="${artColX}" y="${artY}" width="${RANK_ART_W}" height="${RANK_ART_H}" rx="6" ry="6" fill="${SO.card2}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`;

    const nameMaxChars = 38;
    const nameText = fitName(card.name, nameMaxChars);
    rowsSvg += `<text x="${nameColX}" y="${yCenter - 4}" font-family="Arial,sans-serif" font-size="19" font-weight="600" fill="${SO.ink}" letter-spacing="-0.3">${escapeXml(nameText)}</text>`;
    rowsSvg += `<text x="${nameColX}" y="${yCenter + 16}" font-family="Menlo,Consolas,monospace" font-size="11" fill="${SO.muted}" letter-spacing="0.8">${escapeXml((card.bank || '').toUpperCase())}</text>`;

    rowsSvg += getMovementPillSvg(card, tone, FRAME_W - PADDING_X, yCenter);
  }

  const footerSvg = soFooter({
    width: FRAME_W,
    height: FOOTER_H,
    y: FRAME_H - FOOTER_H,
    sectionPath: 'explore',
    meta: `${numRows} cards · ${weekStr}`,
    tone,
  });

  const svg = `<svg width="${FRAME_W}" height="${FRAME_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${frame.defs}
    </defs>
    ${frame.rects}

    ${eyebrowSvg}
    ${titleSvg}
    ${countCluster}

    ${rowsSvg}

    ${footerSvg}
  </svg>`;

  let image = sharp(Buffer.from(svg)).png();

  const overlays = [];
  for (let i = 0; i < numRows; i++) {
    if (cardImages[i]) {
      const yTop = listTop + i * rowH;
      const yCenter = yTop + rowH / 2;
      overlays.push({
        input: cardImages[i],
        left: artColX,
        top: Math.round(yCenter - RANK_ART_H / 2),
      });
    }
  }
  if (overlays.length) {
    image = sharp(await image.toBuffer()).composite(overlays).png();
  }

  return image.toBuffer();
}

function buildPostText(topCards) {
  const list = topCards
    .map((card) => {
      const arrow = card.movement === 'up' ? '⬆️'
        : card.movement === 'down' ? '⬇️'
        : card.movement === 'new' ? '🆕'
        : '➖';
      return `${card.rank}. ${card.name} ${arrow}`;
    })
    .join('\n');

  const base = `Credit Card Power Rankings — This Week’s Top 5 Most Viewed:\n\n${list}`;
  const banks = topCards.map(c => c.bank).filter(Boolean);
  const withHandles = appendBankHandles(base, banks, 260);
  return {
    textContent: base,
    twitterText: withHandles !== base ? withHandles : null,
  };
}

function buildLinkUrl() {
  const url = new URL(EXPLORE_URL);
  url.searchParams.set('utm_source', 'twitter');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'weekly-top-cards');
  const weekStr = new Date().toISOString().slice(0, 10);
  url.searchParams.set('utm_content', `weekly-${weekStr}`);
  return url.toString();
}

async function queuePost(textContent, twitterText, linkUrl, sourceId, imageBuffer) {
  const apiUrl = process.env.SOCIAL_API_URL;
  const apiKey = process.env.SOCIAL_API_KEY;

  if (!apiUrl || !apiKey) throw new Error('SOCIAL_API_URL and SOCIAL_API_KEY are required');

  const body = {
    text_content: textContent,
    link_url: linkUrl,
    source_type: 'weekly-top-cards',
    source_id: sourceId,
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

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('=== Weekly Top Viewed Cards - Power Rankings ===\n');

  const topCards = await fetchTopCards();
  console.log('Top 5 cards by views (last 7 days):');
  for (const card of topCards) {
    const arrow = card.movement === 'up' ? `+${card.movementAmount}`
      : card.movement === 'down' ? `-${card.movementAmount}`
      : card.movement === 'new' ? 'NEW'
      : '—';
    console.log(`  #${card.rank} ${card.name}: ${card.count} views (${arrow})`);
  }

  console.log('\nGenerating power rankings image...');
  const imageBuffer = await generateRankingsImage(topCards);
  console.log(`  Image generated: ${(imageBuffer.length / 1024).toFixed(0)}KB`);

  const { textContent, twitterText } = buildPostText(topCards);
  const linkUrl = buildLinkUrl();
  const sourceId = `weekly-${new Date().toISOString().slice(0, 10)}`;

  console.log(`\nPost text (${textContent.length} chars):\n${textContent}`);
  if (twitterText) {
    console.log(`\nTwitter variant (${twitterText.length} chars):\n${twitterText}`);
  }
  console.log(`\nLink (posted as reply): ${linkUrl}`);

  if (dryRun) {
    const outPath = path.join(__dirname, '..', 'weekly-rankings-preview.png');
    fs.writeFileSync(outPath, imageBuffer);
    console.log(`\n[DRY RUN] Image saved to: ${outPath}`);
    console.log('[DRY RUN] Skipping queue.');
    return;
  }

  console.log('\nQueuing post with image via Social Posting Service...');
  const result = await queuePost(textContent, twitterText, linkUrl, sourceId, imageBuffer);
  console.log(`Queued successfully! Post ID: ${result.id}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
