#!/usr/bin/env node

/**
 * Social Media Auto-Post Script
 *
 * Parses new news/article YAML files, generates an engaging social media post
 * via Claude Haiku, and publishes directly to X/Twitter.
 *
 * Usage: node scripts/post-social.js --type news|article --files <yaml-paths...>
 *
 * Env vars: ANTHROPIC_API_KEY, TWITTER_API_KEY, TWITTER_API_SECRET,
 *           TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { TwitterApi } = require('twitter-api-v2');

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  let type = null;
  const files = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      type = args[++i];
    } else if (args[i] === '--files') {
      // All remaining args are file paths
      files.push(...args.slice(i + 1));
      break;
    }
  }

  if (!type || !['news', 'article'].includes(type)) {
    console.error('Usage: node scripts/post-social.js --type news|article --files <yaml-paths...>');
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('No files provided.');
    process.exit(1);
  }

  return { type, files };
}

/**
 * Build the public URL for a news item or article.
 */
function buildUrl(type, item) {
  if (type === 'news') {
    return `https://creditodds.com/news/${item.id}`;
  }
  return `https://creditodds.com/articles/${item.slug}`;
}

/**
 * Generate an engaging social media post using Claude Haiku.
 */
async function generatePost(type, item) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  const cardNames = item.card_name
    || (item.related_cards && item.related_cards.length > 0
      ? item.related_cards.join(', ')
      : 'N/A');

  const prompt = `Write a social media post for CreditOdds about this ${type}:
Title: ${item.title}
Summary: ${item.summary}
Cards: ${cardNames}

Max 260 characters. Informative, engaging, professional. 1-2 hashtags. Do NOT include the URL.`;

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
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  let text = (data.content[0]?.text || '').trim();

  // Safety: truncate if somehow over 260 chars
  if (text.length > 260) {
    text = text.substring(0, 257) + '...';
  }

  return text;
}

/**
 * Publish a tweet to X/Twitter using the v2 API.
 */
async function publishToTwitter(postText, url) {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });

  const tweetText = `${postText}\n\n${url}`;

  const { data } = await client.v2.tweet(tweetText);
  console.log(`  Tweet posted: https://x.com/creditodds/status/${data.id}`);
  return true;
}

/**
 * Main execution
 */
async function main() {
  const { type, files } = parseArgs();

  console.log(`=== Social Media Auto-Post (${type}) ===\n`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }

  const twitterEnabled = process.env.TWITTER_API_KEY
    && process.env.TWITTER_API_SECRET
    && process.env.TWITTER_ACCESS_TOKEN
    && process.env.TWITTER_ACCESS_TOKEN_SECRET;

  if (!twitterEnabled) {
    console.error('Error: Twitter credentials are not set (TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET)');
    process.exit(1);
  }

  for (const filePath of files) {
    console.log(`Processing: ${filePath}`);

    // Read and parse YAML
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
    console.log(`  URL: ${url}`);

    // Generate post text
    let postText;
    try {
      postText = await generatePost(type, item);
      console.log(`  Generated post (${postText.length} chars): ${postText}`);
    } catch (err) {
      console.error(`  Failed to generate post: ${err.message}`);
      continue;
    }

    // Publish to Twitter
    try {
      await publishToTwitter(postText, url);
      console.log('  Published successfully!\n');
    } catch (err) {
      console.error(`  Twitter publish error: ${err.message}\n`);
    }
  }

  console.log('=== Done ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
