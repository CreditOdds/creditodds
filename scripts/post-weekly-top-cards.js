#!/usr/bin/env node

/**
 * Weekly Top Viewed Cards Social Post
 *
 * Fetches the top 5 most viewed cards from the past week and queues
 * a social post via the Social Posting Service.
 *
 * Usage: node scripts/post-weekly-top-cards.js [--dry-run]
 *
 * Env vars: SOCIAL_API_URL, SOCIAL_API_KEY
 */

const API_BASE = 'https://d2ojrhbh2dincr.cloudfront.net';
const EXPLORE_URL = 'https://creditodds.com/explore';

async function sleep(ms) {
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
  // Fetch view counts for the last 7 days
  const viewsRes = await fetch(`${API_BASE}/card-view?period=7`);
  if (!viewsRes.ok) throw new Error(`Failed to fetch views: ${viewsRes.status}`);
  const { views } = await viewsRes.json();

  // Fetch all cards to map db_card_id -> card_name
  const cardsRes = await fetch(`${API_BASE}/cards`);
  if (!cardsRes.ok) throw new Error(`Failed to fetch cards: ${cardsRes.status}`);
  const cards = await cardsRes.json();

  // Build lookup: numeric db_card_id -> card name
  const cardNameById = {};
  for (const card of cards) {
    if (card.db_card_id) {
      cardNameById[card.db_card_id] = card.card_name || card.name;
    }
  }

  // Sort views descending and pick top 5 that have a known card name
  const ranked = Object.entries(views)
    .map(([id, count]) => ({ id: Number(id), count, name: cardNameById[Number(id)] }))
    .filter(entry => entry.name)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (ranked.length < 5) {
    throw new Error(`Only found ${ranked.length} cards with views — need at least 5`);
  }

  return ranked;
}

function buildTweetText(topCards) {
  const list = topCards
    .map((card, i) => `${i + 1}. ${card.name}`)
    .join('\n');

  return `Five most viewed credit cards on CreditOdds this week:\n\n${list}`;
}

function buildLinkUrl() {
  const url = new URL(EXPLORE_URL);
  url.searchParams.set('utm_source', 'twitter');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'weekly-top-cards');
  return url.toString();
}

async function queuePost(textContent, linkUrl, sourceId) {
  const apiUrl = process.env.SOCIAL_API_URL;
  const apiKey = process.env.SOCIAL_API_KEY;

  if (!apiUrl || !apiKey) throw new Error('SOCIAL_API_URL and SOCIAL_API_KEY are required');

  const response = await fetchWithRetry(`${apiUrl}/social/queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      text_content: textContent,
      link_url: linkUrl,
      source_type: 'weekly-top-cards',
      source_id: sourceId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Queue API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('=== Weekly Top Viewed Cards ===\n');

  const topCards = await fetchTopCards();
  console.log('Top 5 cards by views (last 7 days):');
  for (const card of topCards) {
    console.log(`  ${card.name}: ${card.count} views`);
  }

  const tweetText = buildTweetText(topCards);
  const linkUrl = buildLinkUrl();
  const sourceId = `weekly-${new Date().toISOString().slice(0, 10)}`;

  console.log(`\nTweet text (${tweetText.length} chars):\n${tweetText}`);
  console.log(`\nLink: ${linkUrl}`);
  console.log(`Source ID: ${sourceId}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Skipping queue.');
    return;
  }

  const result = await queuePost(tweetText, linkUrl, sourceId);
  console.log(`\nQueued successfully! Post ID: ${result.id}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
