#!/usr/bin/env node

/**
 * Queue social media posts via the Social Posting Service API.
 * Replaces post-social.js — instead of posting directly to Twitter,
 * this generates text via Claude and queues it for the scheduler.
 *
 * Usage: node scripts/queue-social.js --type news|article|best|page [--dry-run] --files <yaml-paths...>
 *
 * --dry-run generates and prints the post text without queuing it. Use it when
 * changing the prompt: queued posts publish unread within the minute.
 *
 * Env vars: OPENAI_API_KEY, SOCIAL_API_URL, SOCIAL_API_KEY
 */

const fs = require('fs');
const yaml = require('js-yaml');
const { appendBankHandles, bankHandleSuffixLength, resolveBanksFromCardNames } = require('./lib/bank-handles');
const { TWEET_TEXT_LIMIT, sanitizeSocialText, enforceTweetLimit, findFlattenedAttribution } = require('./lib/social-text');

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
  let dryRun = false;
  const files = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      type = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--files') {
      files.push(...args.slice(i + 1));
      break;
    }
  }

  if (!type || !['news', 'article', 'best', 'page'].includes(type)) {
    console.error('Usage: node scripts/queue-social.js --type news|article|best|page [--dry-run] --files <yaml-paths...>');
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('No files provided.');
    process.exit(1);
  }

  return { type, files, dryRun };
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
  // Multi-card items carry card_names (plural), the field build-news.js
  // validates against card_slugs. Missing it here meant a third of news items
  // reached the model with "Cards: N/A" and resolved no bank, so they could
  // never be tagged with their issuer handle.
  if (Array.isArray(item.card_names) && item.card_names.length > 0) {
    return item.card_names.slice();
  }
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

async function generatePost(type, item, corrective = '', limit = TWEET_TEXT_LIMIT) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');

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

  const prompt = `Write a tweet for CreditOdds about this ${label}:
Title: ${item.title}
Summary: ${summary}
Cards: ${cardNames}

Voice: a factual trade-desk account. Informative and specific, never promotional
and never meme-y. The reader should finish the post knowing the concrete facts.

Rules:
- Hard limit ${limit} characters. Aim for ${Math.max(120, limit - 55)} to ${Math.max(140, limit - 25)}: anything over the limit is
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
- Every fact must come from the summary. Do not add, infer, or extrapolate a
  detail the summary does not state, even an obvious-sounding one
- Preserve the summary's certainty. When the summary attributes a claim to an
  outlet ("Doctor of Credit reports", "according to the Wall Street Journal") or
  marks it unverified ("unconfirmed", "rumored", "cardholders report"), keep that
  attribution or hedge on the same claim in the post. Never restate a reported or
  rumored claim as established fact. If it will not fit, drop the claim instead of
  the hedge. A company speaking about its own product ("Chase said", "Citi is
  mailing") is confirmation, so that may be stated flatly
- Timing phrases ("in the coming weeks", "starting September 1", "effective
  immediately") belong to exactly one event. Keep each one attached to the same
  event the summary attaches it to, and never move it onto a different one. If
  you cannot tell which event a date modifies, leave the date out
- Keep the tense the summary uses. An action the summary reports as already done
  ("is emailing cardholders", "announced on August 3") stays in the past or
  present. Never restate it as something that will happen later
- If the summary says where to act (an app tab, activation page), include it
- Plain declarative sentences. No hype, no rhetorical questions, no second-person
  hard sell, no "don't miss", no "act fast", no exclamation marks
- No filler words, no "excited to announce", no "stay tuned"
- 1 hashtag max, only if it adds value. Skip hashtags if the tweet is strong without one
- Do NOT include any URL
- Do NOT use emojis, emoticons, or decorative symbols anywhere. Zero emoji
- Do NOT use em dashes or en dashes. Use a period, comma, or colon instead${corrective}`;

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
  // Strips banned characters (emoji, em dashes) and caps at the real text
  // budget, which leaves room for the t.co link appended at post time.
  //
  // rawLength is the sanitized length BEFORE capping. Capping is lossy, so the
  // caller needs to see the overshoot to decide whether to regenerate; folding
  // it in here silently destroyed that signal.
  const raw = sanitizeSocialText(data.choices[0]?.message?.content || '');
  return { text: enforceTweetLimit(raw, limit), rawLength: raw.length, limit };
}

// Fetch a remote image and return { base64, mimeType } suitable for the
// social-posting-service queue payload. Returns null on any error so the
// post can still be queued without media.
async function fetchImageAsBase64(imageUrl) {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) {
      console.error(`  Image fetch failed: ${res.status} ${imageUrl}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const mimeType = res.headers.get('content-type') || 'image/png';
    return { base64: buf.toString('base64'), mimeType };
  } catch (err) {
    console.error(`  Image fetch error: ${err.message}`);
    return null;
  }
}

async function queuePost(textContent, twitterText, linkUrl, sourceType, sourceId, imageUrl) {
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
  // Attach media (uploaded INTO the post itself, not the link unfurl).
  // The link unfurl card is still driven by the article URL's OG image,
  // which is the editorial illustration. The image attached here is the
  // social composite (photo + brand panel), uploaded as the post's own
  // media attachment. The social-posting-service expects image_base64 +
  // image_mime_type — it uploads the bytes to its own S3 and stores the
  // resulting CDN URL on the queued post.
  if (imageUrl) {
    const img = await fetchImageAsBase64(imageUrl);
    if (img) {
      body.image_base64 = img.base64;
      body.image_mime_type = img.mimeType;
    }
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
  const { type, files, dryRun } = parseArgs();
  console.log(`=== Queue Social Posts (${type})${dryRun ? ' [dry run]' : ''} ===\n`);
  let failures = 0;

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
      // Reserve the issuer handles out of the budget up front. appendBankHandles
      // only ever appends what is left over, so a post generated against the full
      // 255 and landing at 255 silently ships with no @issuer tag at all.
      const banks = resolveBanksFromCardNames(getCardNameList(item));
      const textLimit = TWEET_TEXT_LIMIT - bankHandleSuffixLength(banks);

      let generated = await generatePost(type, item, '', textLimit);
      console.log(`  Generated post (${generated.text.length} chars): ${generated.text}`);

      // Overshooting the budget is recoverable and truncation is not: capping
      // always drops a fact, and on 2026-09-04 a four-character overshoot cost
      // the post its closing clause. Ask once for a shorter version before
      // settling for the capped text.
      if (generated.rawLength > textLimit) {
        console.error(`  Generated ${generated.rawLength} chars against a ${textLimit} char budget. Regenerating.`);
        const corrective = `\n- Your previous attempt was ${generated.rawLength} characters against a ` +
          `${textLimit} character budget. Rewrite it to fit inside ${textLimit} characters while keeping ` +
          'the concrete facts, and finish the closing sentence. Do not end mid-sentence.';
        const retry = await generatePost(type, item, corrective, textLimit);
        console.log(`  Regenerated post (${retry.text.length} chars): ${retry.text}`);
        // Keep the retry when it fits, or when it at least overshoots by less.
        // A retry that runs even longer is a worse cap, so keep the first.
        if (retry.rawLength <= generated.rawLength) generated = retry;
      }
      postText = generated.text;

      // Backstop for the one rewrite that turns a careful summary into a
      // stronger claim than the reporting supports. Retry once with the miss
      // spelled out; if it still flattens, publish nothing rather than an
      // overstated fact, and fail the step so a human sees why.
      let flattened = findFlattenedAttribution(getSummary(item), postText);
      if (flattened) {
        console.error(`  Dropped the "${flattened.marker}" ${flattened.kind} from the summary. Regenerating.`);
        const corrective = `\n- The summary carries a ${flattened.kind} marker ("${flattened.marker}"). Your` +
          ' previous attempt stated that claim as established fact. Keep the attribution or' +
          ' hedge attached to the claim, or leave the claim out entirely.';
        postText = (await generatePost(type, item, corrective, textLimit)).text;
        console.log(`  Regenerated post (${postText.length} chars): ${postText}`);
        flattened = findFlattenedAttribution(getSummary(item), postText);
      }
      if (flattened) {
        console.error(`  Skipping ${filePath}: still states the ${flattened.kind} claim ("${flattened.marker}") as fact.\n`);
        failures++;
        continue;
      }
      if (banks.length > 0) {
        const withHandles = appendBankHandles(postText, banks, TWEET_TEXT_LIMIT);
        if (withHandles !== postText) {
          twitterText = withHandles;
          console.log(`  Twitter variant (${twitterText.length} chars): ${twitterText}`);
        }
      }
    } catch (err) {
      console.error(`  Failed to generate post: ${err.message}`);
      continue;
    }

    // For articles, attach the social-composite image as media on the post.
    // The link unfurl below the post still uses the article URL's OG image
    // (the editorial illustration) — these are two different images by design.
    //
    // Default to the convention <slug>-social.png because sync-article-images.js
    // stamps the social_image field on articles.json, NOT back into the YAML
    // we're reading here. fetchImageAsBase64 in queuePost falls back gracefully
    // if the image doesn't exist on the CDN.
    let imageUrl = null;
    if (type === 'article' && item.slug) {
      const socialFilename = item.social_image || `${item.slug}-social.png`;
      imageUrl = `https://d3ay3etzd1512y.cloudfront.net/article_images/${socialFilename}`;
      console.log(`  Image: ${imageUrl}`);
    } else if (type === 'news' && item.id) {
      // sync-news-images.js (run earlier in build-news.yml) generates and
      // uploads news_images/<id>.png. It stamps news.json, not this YAML, so we
      // rebuild the conventional URL from the id. fetchImageAsBase64 falls back
      // gracefully if the image isn't on the CDN yet.
      const newsFilename = item.news_image || `${item.id}.png`;
      imageUrl = `https://d3ay3etzd1512y.cloudfront.net/news_images/${newsFilename}`;
      console.log(`  Image: ${imageUrl}`);
    }

    if (dryRun) {
      console.log('  Dry run: not queued\n');
      continue;
    }

    try {
      const result = await queuePost(postText, twitterText, url, sourceType, sourceId, imageUrl);
      console.log(`  Queued successfully! Post ID: ${result.id}\n`);
    } catch (err) {
      console.error(`  Failed to queue: ${err.message}\n`);
    }
  }

  console.log('=== Done ===');
  if (failures > 0) {
    console.error(`${failures} item(s) were not queued because the post overstated a hedged claim.`);
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
