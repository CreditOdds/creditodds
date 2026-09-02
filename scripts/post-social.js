#!/usr/bin/env node

/**
 * Social Media Auto-Post Script
 *
 * Parses new news/article YAML files, generates an engaging social media post
 * via Claude Haiku, and publishes directly to X/Twitter.
 *
 * Usage: node scripts/post-social.js --type news|article --files <yaml-paths...>
 *
 * Env vars: OPENAI_API_KEY, TWITTER_API_KEY, TWITTER_API_SECRET,
 *           TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { TwitterApi } = require('twitter-api-v2');
const { appendBankHandles, resolveBanksFromCardNames } = require('./lib/bank-handles');
const { TWEET_TEXT_LIMIT, enforceTweetLimit } = require('./lib/social-text');

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
 * Build the public URL for a news item or article with UTM tracking params.
 */
function buildUrl(type, item) {
  const base = type === 'news'
    ? `https://creditodds.com/news/${item.id}`
    : `https://creditodds.com/articles/${item.slug}`;
  const params = new URLSearchParams({
    utm_source: 'twitter',
    utm_medium: 'social',
    utm_campaign: `auto-${type}`,
    utm_content: type === 'news' ? item.id : item.slug,
  });
  return `${base}?${params}`;
}

/**
 * Generate an engaging social media post using Claude Haiku.
 */
function getCardNameList(item) {
  if (item.card_name) return [item.card_name];
  if (Array.isArray(item.related_cards) && item.related_cards.length > 0) {
    return item.related_cards.slice();
  }
  return [];
}

async function generatePost(type, item) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  const cardList = getCardNameList(item);
  const cardNames = cardList.length > 0 ? cardList.join(', ') : 'N/A';

  const prompt = `Write a tweet for CreditOdds about this credit card ${type}:
Title: ${item.title}
Summary: ${item.summary}
Cards: ${cardNames}

Voice: a factual trade-desk account. Informative and specific, never promotional
and never meme-y. The reader should finish the post knowing the concrete facts.

Rules:
- Hard limit ${TWEET_TEXT_LIMIT} characters. Aim for 200 to 230: anything over the limit is
  cut off mid-sentence, so finish the thought inside the budget. Do not pad to
  fill it, and do not compress facts out to be short
- Default to a single paragraph of plain sentences. Line breaks are for lists,
  not for prose: use them only when there are three or more parallel items
  (cities, tiers, dated milestones), and then put one item per line. Two
  sentences that continue one thought stay on the same line
- Lead with "NEW:" or "BREAKING:" when the item is genuinely new, otherwise open
  with the plain factual statement
- State the concrete terms from the summary (exact amounts, spend requirements,
  dates, deadlines). "$200 back on $1,000" beats "a great new offer"
- Preserve the summary's certainty. When the summary attributes a claim to an
  outlet ("Doctor of Credit reports", "according to the Wall Street Journal") or
  marks it unverified ("unconfirmed", "rumored", "cardholders report"), keep that
  attribution or hedge on the same claim in the post. Never restate a reported or
  rumored claim as established fact. If it will not fit, drop the claim instead of
  the hedge. A company speaking about its own product ("Chase said", "Citi is
  mailing") is confirmation, so that may be stated flatly
- Plain declarative sentences. No hype, no rhetorical questions, no second-person
  hard sell, no "don't miss", no "act fast", no exclamation marks
- No filler words, no "excited to announce", no "stay tuned"
- 1 hashtag max, only if it adds value. Skip hashtags if the tweet is strong without one
- Do NOT include any URL
- Do NOT use emojis, emoticons, or decorative symbols anywhere. Zero emoji
- Do NOT use em dashes or en dashes. Use a period, comma, or colon instead`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 256,
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  // Strips banned characters (emoji, em dashes) and caps at the real text
  // budget, which leaves room for the t.co link appended in publishToTwitter.
  return enforceTweetLimit(data.choices[0]?.message?.content || '');
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

  try {
    const { data } = await client.v2.tweet(tweetText);
    console.log(`  Tweet posted: https://x.com/creditodds/status/${data.id}`);
    return true;
  } catch (err) {
    console.error(`  Twitter API error details:`, JSON.stringify(err.data || err.errors || err.message, null, 2));
    throw err;
  }
}

/**
 * Main execution
 */
async function main() {
  const { type, files } = parseArgs();

  console.log(`=== Social Media Auto-Post (${type}) ===\n`);

  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is not set');
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
      const banks = resolveBanksFromCardNames(getCardNameList(item));
      if (banks.length > 0) {
        const withHandles = appendBankHandles(postText, banks, TWEET_TEXT_LIMIT);
        if (withHandles !== postText) {
          console.log(`  Appended bank handles: ${withHandles.slice(postText.length).trim()}`);
          postText = withHandles;
        }
      }
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
