#!/usr/bin/env node

/**
 * Queues a social media post announcing a newly added credit card.
 *
 * Reads each card YAML, generates a tweet via Claude Haiku, appends the
 * issuer @mention if known, and queues it through the social-posting-service.
 *
 * Usage: node scripts/post-new-card.js --files <yaml-paths...>
 *
 * Env vars: ANTHROPIC_API_KEY, SOCIAL_API_URL, SOCIAL_API_KEY
 *
 * Per-file guards:
 *   - Skip if YAML has `social_post: false` (explicit opt-out)
 *   - Skip if `accepting_applications: false` (card is archived/dead)
 *   - Skip if missing `slug` or `name` (incomplete draft)
 */

const fs = require('fs');
const yaml = require('js-yaml');
const { appendBankHandles } = require('./lib/bank-handles');

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

function parseArgs() {
  const args = process.argv.slice(2);
  const files = [];
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--files') {
      files.push(...args.slice(i + 1).filter(a => a !== '--dry-run'));
      break;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  if (process.argv.includes('--dry-run')) dryRun = true;

  if (files.length === 0) {
    console.error('Usage: node scripts/post-new-card.js --files <yaml-paths...> [--dry-run]');
    process.exit(1);
  }

  return { files, dryRun };
}

function buildUrl(slug) {
  const url = new URL(`https://creditodds.com/card/${slug}`);
  url.searchParams.set('utm_source', 'twitter');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'auto-new-card');
  url.searchParams.set('utm_content', slug);
  return url.toString();
}

function formatFee(fee) {
  if (fee === null || fee === undefined || fee === '') return null;
  const n = Number(fee);
  if (Number.isNaN(n)) return null;
  return n === 0 ? '$0' : `$${n.toLocaleString()}`;
}

function summarizeRewards(rewards) {
  if (!Array.isArray(rewards) || rewards.length === 0) return null;
  const top = rewards
    .filter(r => r && r.value && r.category && r.category !== 'everything_else')
    .sort((a, b) => Number(b.value) - Number(a.value))
    .slice(0, 3)
    .map(r => {
      const unit = r.unit === 'percent' ? '%' : (r.unit === 'points' ? 'x' : (r.unit || ''));
      const cat = String(r.category).replace(/_/g, ' ');
      return `${r.value}${unit} ${cat}`;
    });
  return top.length > 0 ? top.join(', ') : null;
}

function summarizeSignupBonus(bonus) {
  if (!bonus || typeof bonus !== 'object') return null;
  const { value, type, spend_requirement, timeframe_months } = bonus;
  if (!value) return null;
  const unit = type === 'cash' ? '$' : '';
  const suffix = type && type !== 'cash' ? ` ${type}` : '';
  const amount = `${unit}${Number(value).toLocaleString()}${suffix}`;
  if (spend_requirement && timeframe_months) {
    return `${amount} after $${Number(spend_requirement).toLocaleString()} spend in ${timeframe_months} months`;
  }
  return amount;
}

function buildCardSummary(card) {
  const parts = [];
  const fee = formatFee(card.annual_fee);
  if (fee !== null) parts.push(`Annual fee: ${fee}`);
  const sub = summarizeSignupBonus(card.signup_bonus);
  if (sub) parts.push(`Sign-up bonus: ${sub}`);
  const rewards = summarizeRewards(card.rewards);
  if (rewards) parts.push(`Top rewards: ${rewards}`);
  return parts.join('. ');
}

async function generatePost(card) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

  const summary = buildCardSummary(card);

  const prompt = `Write a short tweet announcing a newly added credit card on CreditOdds:
Card: ${card.name}
Issuer: ${card.bank || 'unknown'}
Details: ${summary || 'see card page for details'}

Rules:
- Lead with "NEW:" or "Just added:" to make it clear this is a new addition
- Max 200 characters (shorter is better)
- Highlight the single most compelling detail (sign-up bonus, top reward rate, or $0 annual fee — pick one)
- Write like a human, not a corporate account — be direct, casual, punchy
- No filler words, no "excited to announce", no "stay tuned"
- 1 hashtag max, only if it adds value. Skip hashtags if the tweet is strong without one
- Do NOT include any URL
- Do NOT use em dashes
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

async function queuePost(textContent, twitterText, linkUrl, sourceId) {
  const apiUrl = process.env.SOCIAL_API_URL;
  const apiKey = process.env.SOCIAL_API_KEY;
  if (!apiUrl || !apiKey) throw new Error('SOCIAL_API_URL and SOCIAL_API_KEY are required');

  const body = {
    text_content: textContent,
    link_url: linkUrl,
    source_type: 'new-card',
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
  const { files, dryRun } = parseArgs();
  console.log(`=== Queue New-Card Posts (${files.length} file${files.length === 1 ? '' : 's'})${dryRun ? ' [DRY RUN]' : ''} ===\n`);

  for (const filePath of files) {
    console.log(`Processing: ${filePath}`);

    let card;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      card = yaml.load(content);
    } catch (err) {
      console.error(`  Failed to read/parse: ${err.message}\n`);
      continue;
    }

    if (!card || !card.slug || !card.name) {
      console.log(`  Skipping: missing slug/name\n`);
      continue;
    }

    if (card.social_post === false) {
      console.log(`  Skipping: social_post: false\n`);
      continue;
    }

    if (card.accepting_applications === false) {
      console.log(`  Skipping: accepting_applications is false\n`);
      continue;
    }

    const linkUrl = buildUrl(card.slug);
    console.log(`  URL: ${linkUrl}`);

    let postText;
    let twitterText = null;
    try {
      postText = await generatePost(card);
      console.log(`  Generated (${postText.length} chars): ${postText}`);
      const banks = card.bank ? [card.bank] : [];
      const withHandles = appendBankHandles(postText, banks, 260);
      if (withHandles !== postText) {
        twitterText = withHandles;
        console.log(`  Twitter variant (${twitterText.length} chars): ${twitterText}`);
      }
    } catch (err) {
      console.error(`  Failed to generate post: ${err.message}\n`);
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] Would queue with source_id=new-card-${card.slug}\n`);
      continue;
    }

    try {
      const result = await queuePost(postText, twitterText, linkUrl, `new-card-${card.slug}`);
      console.log(`  Queued! Post ID: ${result.id}\n`);
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
