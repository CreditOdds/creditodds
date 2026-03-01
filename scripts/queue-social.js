#!/usr/bin/env node

/**
 * Queue social media posts via the Social Posting Service API.
 * Replaces post-social.js — instead of posting directly to Twitter,
 * this generates text via Claude and queues it for the scheduler.
 *
 * Usage: node scripts/queue-social.js --type news|article --files <yaml-paths...>
 *
 * Env vars: ANTHROPIC_API_KEY, SOCIAL_API_URL, SOCIAL_API_KEY
 */

const fs = require('fs');
const yaml = require('js-yaml');

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

  if (!type || !['news', 'article'].includes(type)) {
    console.error('Usage: node scripts/queue-social.js --type news|article --files <yaml-paths...>');
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('No files provided.');
    process.exit(1);
  }

  return { type, files };
}

function buildUrl(type, item) {
  if (type === 'news') {
    return `https://creditodds.com/news/${item.id}`;
  }
  return `https://creditodds.com/articles/${item.slug}`;
}

async function generatePost(type, item) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

  const cardNames = item.card_name
    || (item.related_cards && item.related_cards.length > 0
      ? item.related_cards.join(', ')
      : 'N/A');

  const prompt = `Write a short tweet for CreditOdds about this credit card ${type}:
Title: ${item.title}
Summary: ${item.summary}
Cards: ${cardNames}

Rules:
- Max 200 characters (shorter is better)
- Lead with a hook like "BREAKING:" or "NEW:" or a bold statement when appropriate
- Write like a human, not a corporate account — be direct, casual, punchy
- No filler words, no "excited to announce", no "stay tuned"
- 1 hashtag max, only if it adds value. Skip hashtags if the tweet is strong without one
- Do NOT include any URL
- Do NOT use emojis excessively — 0-1 emoji max`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
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

async function queuePost(textContent, linkUrl, sourceType, sourceId) {
  const apiUrl = process.env.SOCIAL_API_URL;
  const apiKey = process.env.SOCIAL_API_KEY;

  if (!apiUrl || !apiKey) throw new Error('SOCIAL_API_URL and SOCIAL_API_KEY are required');

  const response = await fetch(`${apiUrl}/social/queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      text_content: textContent,
      link_url: linkUrl,
      source_type: sourceType,
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
    const sourceId = type === 'news' ? String(item.id) : item.slug;
    console.log(`  URL: ${url}`);

    let postText;
    try {
      postText = await generatePost(type, item);
      console.log(`  Generated post (${postText.length} chars): ${postText}`);
    } catch (err) {
      console.error(`  Failed to generate post: ${err.message}`);
      continue;
    }

    try {
      const result = await queuePost(postText, url, type, sourceId);
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
