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
      rewards: card ? (card.rewards || []) : [],
      apr: card ? (card.apr || {}) : {},
      signup_bonus: card ? card.signup_bonus : null,
      annual_fee: card ? card.annual_fee : null,
    };
  });
}

// ─── Image generation ────────────────────────────────────────────────────────
//
// Layout follows the "T1 — Ranking" template in the design system:
//   1200×630 frame, dot-grid + tone-tinted glow backdrop, hairline accent at top.
//   Header row: eyebrow + title on the left, count + "Cards ranked" on the right.
//   List: 5 evenly-spaced rows, each with rank num (vertical accent bar + "01"),
//   small card art (1.6:1), name + issuer, optional badge pill on the right.

const FRAME_W = 1200;
const FRAME_H = 630;
const FOOTER_H = 56;
const PADDING_X = 56;
const CONTENT_TOP = 40;

const RANK_ART_W = 86;
const RANK_ART_H = Math.round(RANK_ART_W / 1.6); // 54

// Pick a tone for the category — travel-ish lists go gold; the rest stay purple.
function pickTone(slug = '', title = '') {
  const s = (slug + ' ' + title).toLowerCase();
  if (/travel|airline|flight|hotel|cruise|vacation/.test(s)) return 'gold';
  return 'purple';
}

async function fetchCardImage(imageFilename) {
  try {
    const url = `${CDN_IMAGES}/${imageFilename}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    // Render the source card image into the row's small slot — the issuer
    // image (already has its own background) sits on the dark `.so-cardart`
    // surface and is clipped by a 1px inner border.
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

// ─── Per-category stat selection ─────────────────────────────────────────────
//
// Each ranking image highlights a stat that is *relevant to the list's category*
// rather than a subjective badge ("Best Overall"). The stat block sits on the
// right side of each row and mirrors the left-side name/bank stack: a large
// accent-colored value above a small mono label.

const REWARD_LABELS = {
  travel_portal: 'PORTAL TRAVEL',
  flights_portal: 'PORTAL FLIGHTS',
  hotels_portal: 'PORTAL HOTELS',
  hotels_car_portal: 'PORTAL HOTELS',
  airlines: 'AIRLINES',
  hotels: 'HOTELS',
  travel: 'TRAVEL',
  dining: 'DINING',
  groceries: 'GROCERIES',
  gas: 'GAS',
  transit: 'TRANSIT',
  streaming: 'STREAMING',
  online_shopping: 'ONLINE',
  entertainment: 'ENTERTAINMENT',
  drugstores: 'DRUGSTORES',
  warehouse_clubs: 'WAREHOUSE',
  selected_categories: 'CHOSEN CATEGORY',
  top_category: 'TOP CATEGORY',
  foreign_transactions: 'FOREIGN',
  rent: 'RENT',
  everything_else: 'EVERYTHING',
};

function formatRate(reward) {
  const v = Number(reward.value);
  const u = String(reward.unit || '').toLowerCase();
  const isPercent = u.includes('percent') || u.includes('cash');
  const display = v % 1 === 0 ? v : Number(v.toFixed(1));
  return isPercent ? `${display}%` : `${display}x`;
}

function findTopReward(rewards, preferredCategories) {
  if (!rewards || !rewards.length) return null;
  const pool = preferredCategories
    ? rewards.filter(r => preferredCategories.includes(r.category))
    : rewards.filter(r => r.category !== 'everything_else');
  if (!pool.length) return null;
  return [...pool].sort((a, b) => Number(b.value) - Number(a.value))[0];
}

function formatBonusValue(sb) {
  if (!sb || !sb.value) return null;
  if (sb.type === 'cash') return `$${Number(sb.value).toLocaleString()}`;
  if (sb.value >= 1000) return `${Math.round(sb.value / 1000)}K`;
  return String(sb.value);
}

function bonusLabel(sb) {
  if (!sb) return 'BONUS';
  if (sb.type === 'cash') return 'CASH BONUS';
  if (sb.type === 'miles') return 'MILE BONUS';
  return 'POINT BONUS';
}

function feeStat(card) {
  if (typeof card.annual_fee !== 'number') return null;
  const fee = card.annual_fee === 0 ? '$0' : `$${card.annual_fee}`;
  return { value: fee, label: 'ANNUAL FEE' };
}

const TRAVEL_LIKE = ['travel_portal', 'flights_portal', 'hotels_car_portal', 'hotels_portal', 'airlines', 'hotels', 'travel'];

function getCategoryStat(card, categorySlug) {
  const rewards = card.rewards || [];
  const apr = card.apr || {};
  const sb = card.signup_bonus;

  switch (categorySlug) {
    case 'best-travel-cards': {
      const r = findTopReward(rewards, TRAVEL_LIKE) || findTopReward(rewards);
      if (r) return { value: formatRate(r), label: REWARD_LABELS[r.category] || r.category.toUpperCase() };
      break;
    }
    case 'best-airline-cards': {
      const r = findTopReward(rewards, ['airlines', 'flights_portal'])
            || findTopReward(rewards, TRAVEL_LIKE)
            || findTopReward(rewards);
      if (r) return { value: formatRate(r), label: REWARD_LABELS[r.category] || 'AIRLINES' };
      break;
    }
    case 'best-cash-back-cards': {
      const r = findTopReward(rewards);
      if (r) return { value: formatRate(r), label: REWARD_LABELS[r.category] || r.category.toUpperCase() };
      // Cards with only `everything_else` (e.g. flat 2%) — show that
      const fallback = (rewards || []).find(x => x.category === 'everything_else');
      if (fallback) return { value: formatRate(fallback), label: 'EVERY PURCHASE' };
      break;
    }
    case 'best-dining-grocery-cards': {
      const r = findTopReward(rewards, ['dining', 'groceries'])
            || findTopReward(rewards, ['top_category', 'selected_categories'])
            || findTopReward(rewards);
      if (r) return { value: formatRate(r), label: REWARD_LABELS[r.category] || r.category.toUpperCase() };
      break;
    }
    case 'best-0-apr-cards': {
      const intro = apr.purchase_intro;
      const bt = apr.balance_transfer_intro;
      if (intro && Number(intro.rate) === 0 && intro.months) {
        return { value: `${intro.months}mo`, label: '0% APR' };
      }
      if (bt && Number(bt.rate) === 0 && bt.months) {
        return { value: `${bt.months}mo`, label: '0% ON BT' };
      }
      break;
    }
    case 'best-secured-cards': {
      const r = findTopReward(rewards);
      if (r) return { value: formatRate(r), label: REWARD_LABELS[r.category] || r.category.toUpperCase() };
      const fallback = (rewards || []).find(x => x.category === 'everything_else');
      if (fallback) return { value: formatRate(fallback), label: 'EVERY PURCHASE' };
      return feeStat(card);
    }
    case 'best-signup-bonuses': {
      const v = formatBonusValue(sb);
      if (v) return { value: v, label: bonusLabel(sb) };
      break;
    }
    default:
      break;
  }

  return feeStat(card);
}

// Two-line stat block on the right side of each row, mirroring the
// name/bank stack on the left.
function getRowStatSvg(card, categorySlug, tone, rightX, centerY) {
  const t = getTone(tone);
  const stat = getCategoryStat(card, categorySlug);
  if (!stat) return '';
  const valueY = centerY - 4;
  const labelY = centerY + 16;
  return `
    <text x="${rightX}" y="${valueY}" text-anchor="end" font-family="Arial,sans-serif" font-size="24" font-weight="600" fill="${t.accent}" letter-spacing="-0.6">${escapeXml(stat.value)}</text>
    <text x="${rightX}" y="${labelY}" text-anchor="end" font-family="Menlo,Consolas,monospace" font-size="10" font-weight="500" fill="${SO.muted}" letter-spacing="1.4">${escapeXml(stat.label)}</text>
  `;
}

function fitName(name, maxChars) {
  if (name.length <= maxChars) return name;
  return name.slice(0, maxChars - 1).trim() + '…';
}

async function generateBestRankingsImage(categoryTitle, updatedAt, topCards, slug = '') {
  const tone = pickTone(slug, categoryTitle);
  const t = getTone(tone);

  const cardImages = await Promise.all(
    topCards.map(card => card.image ? fetchCardImage(card.image) : Promise.resolve(null))
  );

  const updatedDate = updatedAt
    ? new Date(updatedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

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

  // ── List layout: evenly-spaced rows in the remaining content area ──
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

  // ── Header SVG ──
  const eyebrowSvg = soEyebrow({
    x: PADDING_X,
    y: eyebrowY,
    key: 'Ranked',
    text: `Updated ${updatedDate}`,
    tone,
    size: 13,
  });

  const titleSvg = `
    <text x="${PADDING_X}" y="${titleBaseY}" font-family="Arial,sans-serif" font-size="${titleSize}" font-weight="600" fill="${SO.ink}" letter-spacing="-1.1">${escapeXml(categoryTitle)}</text>
  `;

  const countCluster = `
    <text x="${rightEdge}" y="${countBaseY}" text-anchor="end" font-family="Arial,sans-serif" font-size="${countSize}" font-weight="500" fill="${t.accent}" letter-spacing="-1.3">${countText}</text>
    <text x="${rightEdge}" y="${countLabelY}" text-anchor="end" font-family="Menlo,Consolas,monospace" font-size="10" font-weight="500" fill="${SO.muted}" letter-spacing="1.4">CARDS RANKED</text>
  `;

  // ── Row SVG ──
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

    rowsSvg += getRowStatSvg(card, slug, tone, FRAME_W - PADDING_X, yCenter);
  }

  const footerSvg = soFooter({
    width: FRAME_W,
    height: FOOTER_H,
    y: FRAME_H - FOOTER_H,
    sectionPath: 'best',
    meta: `${numRows} cards · ${updatedDate}`,
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

// ─── Tweet text ──────────────────────────────────────────────────────────────

function buildPostText(categoryTitle, topCards) {
  const banks = topCards.map(c => c.bank).filter(Boolean);

  // Try with badges first, fall back to without if text goes over 280
  for (const includeBadges of [true, false]) {
    const list = topCards
      .map(card => {
        const badge = includeBadges && card.badge ? ` (${card.badge})` : '';
        return `${card.rank}. ${card.name}${badge}`;
      })
      .join('\n');

    const base = `${categoryTitle} \u2014 Our Top 5:\n\n${list}`;
    if (base.length <= 280) {
      const withHandles = appendBankHandles(base, banks, 280);
      return {
        textContent: base,
        twitterText: withHandles !== base ? withHandles : null,
      };
    }
  }

  // Shouldn't happen, but truncate if still over
  const list = topCards.map(card => `${card.rank}. ${card.name}`).join('\n');
  const base = (`${categoryTitle} \u2014 Our Top 5:\n\n${list}`).slice(0, 280);
  const withHandles = appendBankHandles(base, banks, 280);
  return {
    textContent: base,
    twitterText: withHandles !== base ? withHandles : null,
  };
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

async function queuePost(textContent, twitterText, linkUrl, sourceId, imageBuffer) {
  const apiUrl = process.env.SOCIAL_API_URL;
  const apiKey = process.env.SOCIAL_API_KEY;

  if (!apiUrl || !apiKey) throw new Error('SOCIAL_API_URL and SOCIAL_API_KEY are required');

  const body = {
    text_content: textContent,
    link_url: linkUrl,
    source_type: 'best-rankings',
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
  const imageBuffer = await generateBestRankingsImage(bestData.title, bestData.updatedAt, enrichedCards, bestData.slug);
  console.log(`  Image generated: ${(imageBuffer.length / 1024).toFixed(0)}KB`);

  const { textContent, twitterText } = buildPostText(bestData.title, enrichedCards);
  const linkUrl = buildLinkUrl(bestData.slug);
  const sourceId = `best-${bestData.slug}-${new Date().toISOString().slice(0, 10)}`;

  console.log(`\nPost text (${textContent.length} chars):\n${textContent}`);
  if (twitterText) {
    console.log(`\nTwitter variant (${twitterText.length} chars):\n${twitterText}`);
  }
  console.log(`\nLink (posted as reply): ${linkUrl}`);

  if (dryRun) {
    const outPath = path.join(__dirname, '..', `best-rankings-preview-${category}.png`);
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
