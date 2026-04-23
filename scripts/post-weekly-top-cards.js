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
const { V2, darkBackground, footerBar } = require('./lib/og-style');
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

async function fetchCardImage(imageFilename) {
  try {
    const url = `${CDN_IMAGES}/${imageFilename}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return await sharp(buffer)
      .resize(200, 126, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
  } catch (err) {
    console.log(`  Warning: failed to fetch image ${imageFilename}: ${err.message}`);
    return null;
  }
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function generateRankingsImage(topCards) {
  const cardImages = await Promise.all(
    topCards.map(card => card.image ? fetchCardImage(card.image) : Promise.resolve(null))
  );

  const width = 1080;
  const rowHeight = 140;
  const headerHeight = 120;
  const footerHeight = 60;
  const height = headerHeight + (rowHeight * 5) + footerHeight;

  function getMovementSvg(card) {
    if (card.movement === 'up') {
      return `<g>
        <polygon points="0,12 8,0 16,12" fill="${V2.emerald}"/>
        <text x="20" y="12" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="${V2.emerald}">+${card.movementAmount}</text>
      </g>`;
    } else if (card.movement === 'down') {
      return `<g>
        <polygon points="0,0 8,12 16,0" fill="${V2.warn}"/>
        <text x="20" y="12" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="${V2.warn}">-${card.movementAmount}</text>
      </g>`;
    } else if (card.movement === 'new') {
      return `<text x="0" y="12" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="${V2.accent}">NEW</text>`;
    } else {
      return `<text x="0" y="12" font-family="Arial,sans-serif" font-size="16" fill="rgba(255,255,255,0.45)">\u2014</text>`;
    }
  }

  const now = new Date();
  const weekStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  let rowsSvg = '';
  for (let i = 0; i < 5; i++) {
    const card = topCards[i];
    const y = headerHeight + (i * rowHeight);
    const bgFill = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0)';

    rowsSvg += `
      <rect x="0" y="${y}" width="${width}" height="${rowHeight}" fill="${bgFill}"/>
      <line x1="40" y1="${y}" x2="${width - 40}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <circle cx="55" cy="${y + rowHeight / 2}" r="28" fill="${V2.accent}"/>
      <text x="55" y="${y + rowHeight / 2 + 10}" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="bold" fill="white">${card.rank}</text>
      <text x="310" y="${y + rowHeight / 2 - 8}" font-family="Arial,sans-serif" font-size="24" font-weight="bold" fill="#ffffff">${escapeXml(card.name)}</text>
      <text x="310" y="${y + rowHeight / 2 + 18}" font-family="Arial,sans-serif" font-size="16" fill="rgba(255,255,255,0.6)">${escapeXml(card.bank || '')}</text>
      <g transform="translate(${width - 80}, ${y + rowHeight / 2 - 6})">
        ${getMovementSvg(card)}
      </g>
    `;
  }

  const bg = darkBackground({ width, height, accent: V2.accent });

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${bg.defs}
    </defs>
    ${bg.rects}
    <text x="40" y="58" font-family="Arial,sans-serif" font-size="36" font-weight="bold" fill="#ffffff" letter-spacing="-0.5">Weekly Power Rankings</text>
    <text x="40" y="92" font-family="Arial,sans-serif" font-size="16" fill="${V2.accent}" letter-spacing="1.5">TOP 5 MOST VIEWED \u00B7 WEEK OF ${escapeXml(weekStr).toUpperCase()}</text>
    ${rowsSvg}
    ${footerBar({ width, y: height - footerHeight, height: footerHeight })}
  </svg>`;

  let image = sharp(Buffer.from(svg)).png();

  const overlays = [];
  for (let i = 0; i < 5; i++) {
    if (cardImages[i]) {
      const y = headerHeight + (i * rowHeight) + Math.round((rowHeight - 86) / 2);
      overlays.push({
        input: await sharp(cardImages[i]).resize(136, 86, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
        left: 110,
        top: y,
      });
    }
  }

  if (overlays.length > 0) {
    image = sharp(await image.toBuffer()).composite(overlays).png();
  }

  return image.toBuffer();
}

function buildPostText(topCards) {
  const list = topCards
    .map((card) => {
      const arrow = card.movement === 'up' ? '\u2B06\uFE0F'
        : card.movement === 'down' ? '\u2B07\uFE0F'
        : card.movement === 'new' ? '\uD83C\uDD95'
        : '\u2796';
      return `${card.rank}. ${card.name} ${arrow}`;
    })
    .join('\n');

  const base = `Credit Card Power Rankings \u2014 This Week\u2019s Top 5 Most Viewed:\n\n${list}`;
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
      : '\u2014';
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
