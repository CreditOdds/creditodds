#!/usr/bin/env node

/**
 * Best Rankings Social Post
 *
 * Reads a best-cards category YAML, generates a branded PNG image
 * showing the top 5 ranked cards with badges, and queues the post
 * via the Social Posting Service (link posted as a reply).
 *
 * Usage:
 *   node scripts/post-best-rankings.js --category best-travel-cards
 *   node scripts/post-best-rankings.js --category best-travel-cards --dry-run
 *
 * Env vars: SOCIAL_API_URL, SOCIAL_API_KEY
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const sharp = require('sharp');

const API_BASE = 'https://d2ojrhbh2dincr.cloudfront.net';
const CDN_IMAGES = 'https://d3ay3etzd1512y.cloudfront.net/card_images';
const BEST_DIR = path.join(__dirname, '..', 'data', 'best');

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

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let category = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) {
      category = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  if (!category) {
    console.error('Usage: node scripts/post-best-rankings.js --category <slug> [--dry-run]');
    process.exit(1);
  }

  return { category, dryRun };
}

// ─── Data loading ────────────────────────────────────────────────────────────

function loadBestCategory(slug) {
  const filePath = path.join(BEST_DIR, `${slug}.yaml`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Best category file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = yaml.load(raw);
  return {
    title: data.title,
    slug: data.slug,
    updatedAt: data.updated_at,
    cards: (data.cards || []).slice(0, 5).map((c, i) => ({
      slug: c.slug,
      badge: c.badge || null,
      previousRank: c.previous_rank || null,
      rank: i + 1,
    })),
  };
}

async function fetchCardDetails(bestCards) {
  const res = await fetch(`${API_BASE}/cards`);
  if (!res.ok) throw new Error(`Failed to fetch cards: ${res.status}`);
  const allCards = await res.json();

  const cardBySlug = {};
  for (const card of allCards) {
    const slug = card.slug || card.card_id;
    if (slug) cardBySlug[slug] = card;
  }

  return bestCards.map(bc => {
    const card = cardBySlug[bc.slug];
    if (!card) {
      console.warn(`  Warning: card not found for slug "${bc.slug}"`);
    }
    return {
      ...bc,
      name: card ? (card.card_name || card.name) : bc.slug,
      image: card ? card.card_image_link : null,
      bank: card ? (card.bank || '') : '',
    };
  });
}

// ─── Image generation ────────────────────────────────────────────────────────

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

function getBadgeOrMovementSvg(card) {
  if (card.badge) {
    const badgeText = escapeXml(card.badge);
    const textWidth = card.badge.length * 8;
    const pillWidth = textWidth + 24;
    const x = -pillWidth;
    return `<g>
      <rect x="${x}" y="-10" width="${pillWidth}" height="24" rx="12" fill="#eef2ff" stroke="#c7d2fe" stroke-width="1"/>
      <text x="${x + pillWidth / 2}" y="7" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#4f46e5">${badgeText}</text>
    </g>`;
  }

  if (card.previousRank) {
    const movement = card.previousRank - card.rank;
    if (movement > 0) {
      return `<g>
        <polygon points="0,12 8,0 16,12" fill="#16a34a"/>
        <text x="20" y="12" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#16a34a">+${movement}</text>
      </g>`;
    } else if (movement < 0) {
      return `<g>
        <polygon points="0,0 8,12 16,0" fill="#dc2626"/>
        <text x="20" y="12" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#dc2626">${movement}</text>
      </g>`;
    }
  }

  return '';
}

async function generateBestRankingsImage(categoryTitle, updatedAt, topCards) {
  const cardImages = await Promise.all(
    topCards.map(card => card.image ? fetchCardImage(card.image) : Promise.resolve(null))
  );

  const width = 1080;
  const rowHeight = 140;
  const headerHeight = 120;
  const footerHeight = 60;
  const height = headerHeight + (rowHeight * 5) + footerHeight;

  const updatedDate = updatedAt
    ? new Date(updatedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const rankColors = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'];
  const rowColors = ['#f8fafc', '#ffffff'];

  let rowsSvg = '';
  for (let i = 0; i < 5; i++) {
    const card = topCards[i];
    const y = headerHeight + (i * rowHeight);
    const bgColor = rowColors[i % 2];

    rowsSvg += `
      <rect x="0" y="${y}" width="${width}" height="${rowHeight}" fill="${bgColor}"/>
      <circle cx="55" cy="${y + rowHeight / 2}" r="28" fill="${rankColors[i]}"/>
      <text x="55" y="${y + rowHeight / 2 + 10}" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="bold" fill="white">${card.rank}</text>
      <text x="310" y="${y + rowHeight / 2 - 8}" font-family="Arial,sans-serif" font-size="24" font-weight="bold" fill="#1e293b">${escapeXml(card.name)}</text>
      <text x="310" y="${y + rowHeight / 2 + 18}" font-family="Arial,sans-serif" font-size="16" fill="#64748b">${escapeXml(card.bank)}</text>
      <g transform="translate(${width - 30}, ${y + rowHeight / 2 - 6})">
        ${getBadgeOrMovementSvg(card)}
      </g>
    `;
  }

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#4f46e5"/>
        <stop offset="100%" style="stop-color:#7c3aed"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="#ffffff"/>
    <rect x="0" y="0" width="${width}" height="${headerHeight}" fill="url(#headerGrad)"/>
    <text x="40" y="52" font-family="Arial,sans-serif" font-size="36" font-weight="bold" fill="white">${escapeXml(categoryTitle)}</text>
    <text x="40" y="85" font-family="Arial,sans-serif" font-size="18" fill="rgba(255,255,255,0.85)">Updated ${escapeXml(updatedDate)}</text>
    ${rowsSvg}
    <rect x="0" y="${height - footerHeight}" width="${width}" height="${footerHeight}" fill="#f1f5f9"/>
    <text x="${width / 2}" y="${height - 22}" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="600" fill="#64748b">creditodds.com</text>
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

// ─── Tweet text ──────────────────────────────────────────────────────────────

function buildTweetText(categoryTitle, topCards) {
  // Try with badges first, fall back to without if over 280 chars
  for (const includeBadges of [true, false]) {
    const list = topCards
      .map(card => {
        const badge = includeBadges && card.badge ? ` (${card.badge})` : '';
        return `${card.rank}. ${card.name}${badge}`;
      })
      .join('\n');

    const text = `${categoryTitle} \u2014 Our Top 5:\n\n${list}`;
    if (text.length <= 280) return text;
  }

  // Shouldn't happen, but truncate if still over
  const list = topCards.map(card => `${card.rank}. ${card.name}`).join('\n');
  return `${categoryTitle} \u2014 Our Top 5:\n\n${list}`.slice(0, 280);
}

function buildLinkUrl(slug) {
  const url = new URL(`https://creditodds.com/best/${slug}`);
  url.searchParams.set('utm_source', 'twitter');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'best-rankings');
  url.searchParams.set('utm_content', slug);
  return url.toString();
}

// ─── Queue post ──────────────────────────────────────────────────────────────

async function queuePost(textContent, linkUrl, sourceId, imageBuffer) {
  const apiUrl = process.env.SOCIAL_API_URL;
  const apiKey = process.env.SOCIAL_API_KEY;

  if (!apiUrl || !apiKey) throw new Error('SOCIAL_API_URL and SOCIAL_API_KEY are required');

  const body = {
    text_content: textContent,
    link_url: linkUrl,
    source_type: 'best-rankings',
    source_id: sourceId,
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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { category, dryRun } = parseArgs();

  console.log(`=== Best Rankings Post: ${category} ===\n`);

  const bestData = loadBestCategory(category);
  console.log(`Category: ${bestData.title}`);
  console.log(`Cards: ${bestData.cards.length}`);

  const enrichedCards = await fetchCardDetails(bestData.cards);
  console.log('\nTop 5:');
  for (const card of enrichedCards) {
    const badge = card.badge ? ` [${card.badge}]` : '';
    console.log(`  #${card.rank} ${card.name}${badge}`);
  }

  console.log('\nGenerating best rankings image...');
  const imageBuffer = await generateBestRankingsImage(bestData.title, bestData.updatedAt, enrichedCards);
  console.log(`  Image generated: ${(imageBuffer.length / 1024).toFixed(0)}KB`);

  const tweetText = buildTweetText(bestData.title, enrichedCards);
  const linkUrl = buildLinkUrl(bestData.slug);
  const sourceId = `best-${bestData.slug}-${new Date().toISOString().slice(0, 10)}`;

  console.log(`\nPost text (${tweetText.length} chars):\n${tweetText}`);
  console.log(`\nLink (posted as reply): ${linkUrl}`);

  if (dryRun) {
    const outPath = path.join(__dirname, '..', `best-rankings-preview-${category}.png`);
    fs.writeFileSync(outPath, imageBuffer);
    console.log(`\n[DRY RUN] Image saved to: ${outPath}`);
    console.log('[DRY RUN] Skipping queue.');
    return;
  }

  console.log('\nQueuing post with image via Social Posting Service...');
  const result = await queuePost(tweetText, linkUrl, sourceId, imageBuffer);
  console.log(`Queued successfully! Post ID: ${result.id}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
