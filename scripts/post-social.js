#!/usr/bin/env node

/**
 * Social Media Auto-Post Script
 *
 * Parses new news/article YAML files, generates an engaging social media post
 * via Claude Haiku, and publishes to X, Facebook, LinkedIn, and Instagram
 * via the Ayrshare API.
 *
 * Usage: node scripts/post-social.js --type news|article --files <yaml-paths...>
 *
 * Env vars: ANTHROPIC_API_KEY, AYRSHARE_API_KEY
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

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
 * Build the OG image URL for social media previews.
 */
function buildOgImageUrl(type, item) {
  if (type === 'news') {
    return `https://creditodds.com/news/${item.id}/opengraph-image`;
  }
  return `https://creditodds.com/articles/${item.slug}/opengraph-image`;
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

  // Safety: truncate if somehow over 280 chars (leaving room for URL)
  if (text.length > 260) {
    text = text.substring(0, 257) + '...';
  }

  return text;
}

/**
 * Publish a post to social media via Ayrshare.
 */
async function publishToAyrshare(postText, url, ogImageUrl) {
  const apiKey = process.env.AYRSHARE_API_KEY;
  if (!apiKey) {
    throw new Error('AYRSHARE_API_KEY environment variable is required');
  }

  const fullPost = `${postText}\n\n${url}`;

  const body = {
    post: fullPost,
    platforms: ['twitter', 'facebook', 'linkedin', 'reddit'],
    mediaUrls: [ogImageUrl],
    shortenLinks: true,
    redditOptions: {
      title: postText,
      subreddit: 'creditodds',
    },
  };

  const response = await fetch('https://app.ayrshare.com/api/post', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`  Ayrshare API error (${response.status}):`, JSON.stringify(data));
    return false;
  }

  console.log('  Ayrshare response:', JSON.stringify(data));
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
  if (!process.env.AYRSHARE_API_KEY) {
    console.error('Error: AYRSHARE_API_KEY is not set');
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
    const ogImageUrl = buildOgImageUrl(type, item);
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

    // Publish via Ayrshare
    try {
      const success = await publishToAyrshare(postText, url, ogImageUrl);
      if (success) {
        console.log('  Published successfully!\n');
      } else {
        console.log('  Publishing failed (non-fatal).\n');
      }
    } catch (err) {
      console.error(`  Ayrshare publish error: ${err.message}\n`);
    }
  }

  console.log('=== Done ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
