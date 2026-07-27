#!/usr/bin/env node

/**
 * Queues a social media post announcing a newly added credit card.
 *
 * Reads each card YAML, generates a tweet via Claude Haiku, appends the
 * issuer @mention if known, and queues it through the social-posting-service.
 *
 * Usage: node scripts/post-new-card.js --files <yaml-paths...>
 *
 * Env vars: OPENAI_API_KEY, SOCIAL_API_URL, SOCIAL_API_KEY
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

// A reward carrying `merchant_specific: true` or a non-empty `merchant_gate`
// does NOT apply to its whole spending category — the category is just the
// bucket the rate lives in. Feeding "5% online_shopping" to the model for the
// Intuit Business card produced "5% rewards on online shopping", when the 5%
// only covers Intuit's own products and the card's real headline rate is a flat
// 2%. So gated rates are quarantined into their own labeled section with the
// scope text from the reward's `note`, and a rate with no `note` is dropped
// outright (there is nothing truthful to say about its scope).
function isMerchantGated(reward) {
  return reward.merchant_specific === true
    || (Array.isArray(reward.merchant_gate) && reward.merchant_gate.length > 0);
}

// The schema's only units are `percent` and `points_per_dollar` — the bare
// `points` this used to check is not a value any card carries, so every points
// and miles card fed the model raw "5points_per_dollar on travel portal".
function formatRate(reward) {
  const unit = reward.unit === 'percent'
    ? '%'
    : (reward.unit === 'points_per_dollar' || reward.unit === 'points' ? 'x' : (reward.unit || ''));
  return `${reward.value}${unit}`;
}

function categoryLabel(category) {
  return String(category).replace(/_/g, ' ');
}

const MAX_NOTE_CHARS = 140;

function truncateNote(note) {
  const clean = String(note).trim().replace(/\s+/g, ' ');
  return clean.length > MAX_NOTE_CHARS ? `${clean.slice(0, MAX_NOTE_CHARS - 1)}…` : clean;
}

// Returns { ungated, gated } summary strings, either of which may be null.
// `ungated` covers rates the copy may state plainly (including the flat
// everything_else rate, which is often the card's true headline number and was
// previously filtered out entirely).
function summarizeRewards(rewards) {
  if (!Array.isArray(rewards) || rewards.length === 0) return { ungated: null, gated: null };

  const valid = rewards.filter(r => r && r.value && r.category);
  const byValueDesc = (a, b) => Number(b.value) - Number(a.value);
  const isBonusCategory = r => r.category !== 'everything_else';

  const ungatedParts = valid
    .filter(r => isBonusCategory(r) && !isMerchantGated(r))
    .sort(byValueDesc)
    .slice(0, 3)
    .map(r => `${formatRate(r)} on ${categoryLabel(r.category)}`);

  const flat = valid.find(r => r.category === 'everything_else');
  if (flat) {
    ungatedParts.push(
      `${formatRate(flat)} on ${ungatedParts.length > 0 ? 'everything else' : 'every purchase'}`
    );
  }

  const gatedParts = valid
    .filter(r => isBonusCategory(r) && isMerchantGated(r) && r.note)
    .sort(byValueDesc)
    .map(r => `${formatRate(r)} in the ${categoryLabel(r.category)} category, limited to: ${truncateNote(r.note)}`);

  return {
    ungated: ungatedParts.length > 0 ? ungatedParts.join(', ') : null,
    gated: gatedParts.length > 0 ? gatedParts.join('; ') : null,
  };
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
  const { ungated, gated } = summarizeRewards(card.rewards);
  if (ungated) parts.push(`Top rewards, each applying to the whole category named: ${ungated}`);
  if (gated) {
    parts.push(
      'Merchant-limited rates, which apply ONLY at the merchants named and NOT to the '
      + `whole category: ${gated}`
    );
  }
  return parts.join('. ');
}

async function generatePost(card) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');

  const summary = buildCardSummary(card);

  const prompt = `Write a short tweet announcing a newly added credit card on CreditOdds:
Card: ${card.name}
Issuer: ${card.bank || 'unknown'}
Details: ${summary || 'see card page for details'}

Rules:
- Tone: formal and informative, like a brief from a financial publication. No clickbait, no hype, no sensational hooks
- Open with a plain statement that the card is now listed, e.g. "Now on CreditOdds: ..." or "The ${card.name} has been added to CreditOdds"
- Max 200 characters (shorter is better)
- State the most notable facts plainly (sign-up bonus, top reward rate, or annual fee) — facts only, no editorializing
- Rates under "Top rewards" apply to the whole category and can be stated plainly, e.g. "3% on dining"
- Rates under "Merchant-limited rates" apply ONLY at the merchants named after "limited to". Either name that limit in the tweet (e.g. "5% on Intuit products") or leave the rate out entirely and use a top reward instead. Never write a merchant-limited rate as if it covered its whole category
- Never repeat the labels from the details above ("merchant-limited", "top rewards", "applies to the whole category") in the tweet. Name the merchants directly instead
- No exclamation points, no all-caps words, no rhetorical questions
- No filler words, no "excited to announce", no "stay tuned"
- No hashtags
- Do NOT include any URL
- Do NOT use em dashes
- Do NOT use emojis`;

  const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  let text = (data.choices[0]?.message?.content || '').trim();
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

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  isMerchantGated,
  summarizeRewards,
  summarizeSignupBonus,
  buildCardSummary,
};
