#!/usr/bin/env node

/**
 * Queue social media posts via the Social Posting Service API.
 * Replaces post-social.js — instead of posting directly to Twitter,
 * this generates text via Claude and queues it for the scheduler.
 *
 * Usage: node scripts/queue-social.js --type news|article|best|page --files <yaml-paths...>
 *
 * Env vars: ANTHROPIC_API_KEY, SOCIAL_API_URL, SOCIAL_API_KEY
 */

const fs = require('fs');
const yaml = require('js-yaml');
const { appendBankHandles, resolveBanksFromCardNames } = require('./lib/bank-handles');

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

function parseArgs() {
  const args = process.argv.slice(2);
  let type = null;
  const files = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      type = args[++i];
    } else if (args[i] === '--files') {
      files.push(...args.slice(i + 1));
      break;
    }
  }

  if (!type || !['news', 'article', 'best', 'page'].includes(type)) {
    console.error('Usage: node scripts/queue-social.js --type news|article|best|page --files <yaml-paths...>');
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('No files provided.');
    process.exit(1);
  }

  return { type, files };
}

function buildUrl(type, item, source = 'twitter') {
  const explicitUrl = item.url;
  let base = explicitUrl;

  if (!base) {
    if (type === 'news') {
      base = `https://creditodds.com/news/${item.id}`;
    } else if (type === 'article') {
      base = `https://creditodds.com/articles/${item.slug}`;
    } else if (type === 'best') {
      const slug = item.slug || item.id;
      if (!slug) throw new Error('Missing slug/id for best item');
      base = `https://creditodds.com/best/${slug}`;
    } else if (type === 'page') {
      throw new Error('Missing url for page item');
    }
  }

  if (!base) throw new Error('Unable to build URL');

  const url = new URL(base);
  const contentId = item.id || item.slug || item.title || 'page';
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', `auto-${type}`);
  url.searchParams.set('utm_content', contentId);
  return url.toString();
}

function getSummary(item) {
  const raw = item.summary || item.description || item.seo_description || item.intro || '';
  if (!raw) return '';
  const text = String(raw).trim();
  if (!text) return '';
  // Keep prompts tight: use the first paragraph if intro is long.
  return text.split(/\n{2,}/)[0].trim();
}

function getCardNameList(item) {
  if (item.card_name) return [item.card_name];
  if (Array.isArray(item.related_cards) && item.related_cards.length > 0) {
    return item.related_cards.slice();
  }
  if (Array.isArray(item.cards) && item.cards.length > 0) {
    return item.cards
      .map((card) => card.card_name || card.slug || card)
      .filter(Boolean);
  }
  return [];
}

async function generatePost(type, item) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

  const cardList = getCardNameList(item);
  const cardNames = cardList.length > 0 ? cardList.join(', ') : 'N/A';

  const summary = getSummary(item);
  const label = type === 'news'
    ? 'news update'
    : type === 'article'
      ? 'article'
      : type === 'best'
        ? 'best-of list'
        : type === 'page'
          ? 'site page'
          : type;

  const prompt = `Write a short tweet for CreditOdds about this ${label}:
Title: ${item.title}
Summary: ${summary}
Cards: ${cardNames}

Rules:
- Max 200 characters (shorter is better)
- Lead with a hook like "BREAKING:" or "NEW:" or a bold statement when appropriate
- Write like a human, not a corporate account — be direct, casual, punchy
- No filler words, no "excited to announce", no "stay tuned"
- 1 hashtag max, only if it adds value. Skip hashtags if the tweet is strong without one
- Do NOT include any URL
- Do NOT use emojis excessively — 0-1 emoji max`;

  const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  let text = (data.content[0]?.text || '').trim();
  if (text.length > 260) text = text.substring(0, 257) + '...';
  return text;
}

async function queuePost(textContent, twitterText, linkUrl, sourceType, sourceId) {
  const apiUrl = process.env.SOCIAL_API_URL;
  const apiKey = process.env.SOCIAL_API_KEY;

  if (!apiUrl || !apiKey) throw new Error('SOCIAL_API_URL and SOCIAL_API_KEY are required');

  const body = {
    text_content: textContent,
    link_url: linkUrl,
    source_type: sourceType,
    source_id: sourceId,
  };
  if (twitterText && twitterText !== textContent) {
    body.twitter_text = twitterText;
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
  const { type, files } = parseArgs();
  console.log(`=== Queue Social Posts (${type}) ===\n`);

  for (const filePath of files) {
    console.log(`Processing: ${filePath}`);

    let item;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      item = yaml.load(content);
    } catch (err) {
      console.error(`  Failed to read/parse ${filePath}: ${err.message}`);
      continue;
    }

    if (!item || (!item.id && !item.slug)) {
      console.error(`  Skipping ${filePath}: missing id/slug`);
      continue;
    }

    const url = buildUrl(type, item);
    const sourceId = String(item.source_id || item.id || item.slug);
    const sourceType = item.source_type || type;
    console.log(`  URL: ${url}`);

    let postText;
    let twitterText = null;
    try {
      postText = await generatePost(type, item);
      console.log(`  Generated post (${postText.length} chars): ${postText}`);
      const banks = resolveBanksFromCardNames(getCardNameList(item));
      if (banks.length > 0) {
        const withHandles = appendBankHandles(postText, banks, 260);
        if (withHandles !== postText) {
          twitterText = withHandles;
          console.log(`  Twitter variant (${twitterText.length} chars): ${twitterText}`);
        }
      }
    } catch (err) {
      console.error(`  Failed to generate post: ${err.message}`);
      continue;
    }

    try {
      const result = await queuePost(postText, twitterText, url, sourceType, sourceId);
      console.log(`  Queued successfully! Post ID: ${result.id}\n`);
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
