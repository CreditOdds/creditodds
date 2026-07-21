#!/usr/bin/env node
/**
 * sync-news-images.js
 *
 * For each item in data/news.json, ensures a single "clickbait" hero image
 * exists on S3 at `news_images/<id>.png`, then stamps the filename into the
 * item's `news_image` field (in data/news.json, in place).
 *
 * The image is a surreal-but-photoreal scene (beach, circus, stadium, …,
 * picked deterministically by the news id) in which the REAL card art for the
 * cards the story is about is composited in as the hero subject. We use
 * OpenAI's image EDITS endpoint with the actual card PNGs as reference
 * images (`input_fidelity: high`) so the cards stay recognizable rather than
 * being invented from scratch. News items with no associated card fall back to
 * the text-to-image generations endpoint with a generic card in the scene.
 *
 * The stamped `news_image` is used as the news-page hero and the OG image, and
 * is attached to the social post (see scripts/queue-social.js).
 *
 * Idempotent: S3 is the source of truth. If the object already exists we just
 * stamp the field and skip generation — so re-running is cheap and CI-safe.
 * data/news.json is gitignored / rebuilt in CI, so nothing is committed here.
 *
 * Env:
 *   OPENAI_API_KEY          (required when any generation is needed)
 *   S3_IMAGES_BUCKET_NAME   (required for uploads — same bucket as card_images)
 *
 * Flags:
 *   --force <id>       Regenerate this news id even if S3 already has it.
 *   --force-all        Regenerate every news item (expensive).
 *   --only <id>        Process just this one id (handy for previews).
 *   --limit <n>        Stop after generating <n> images this run (backfill in batches).
 *   --quality <q>      Image quality: low | medium | high (default medium).
 *   --model <m>        Image model (default gpt-image-1-mini). Use gpt-image-1,
 *                      gpt-image-1.5 or gpt-image-2 for a one-off flagship render.
 *   --dry-run          Log what would happen, but don't call OpenAI or S3.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const crypto = require('crypto');

const NEWS_JSON = path.join(__dirname, '..', 'data', 'news.json');
const S3_PREFIX = 'news_images';
const CARD_CDN = 'https://d3ay3etzd1512y.cloudfront.net/card_images';
const MAX_CARDS = 3; // cards fanned into one scene — more than this gets crowded

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const forceAll = args.includes('--force-all');
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const forceIds = new Set(
  args.map((a, i) => (a === '--force' ? args[i + 1] : null)).filter(Boolean)
);
const onlyId = argVal('--only');
const limit = argVal('--limit') ? parseInt(argVal('--limit'), 10) : Infinity;
// Defaults chosen for cost. gpt-image-1 at high/1536x1024 is $0.25 per image,
// the most expensive combination OpenAI sells for that model, and every
// successor now undercuts it (gpt-image-1.5 ~$0.20, gpt-image-2 ~$0.165).
// gpt-image-1-mini supports the same /images/edits endpoint with reference
// images, the same sizes, and the same three quality tiers, at $0.019 for
// medium/1536x1024 — a ~92% cut with the pipeline unchanged. Matches the
// quality tier sync-article-images.js has always used.
//
// Both are overridable per run (--model, --quality) so a hero image that
// genuinely needs the flagship can have it without changing the default for
// the other ~99% of generations.
const model = argVal('--model') || 'gpt-image-1-mini';
const quality = argVal('--quality') || 'medium';

const bucket = process.env.S3_IMAGES_BUCKET_NAME;
const openaiKey = process.env.OPENAI_API_KEY;

function log(msg) {
  process.stdout.write(`[sync-news-images] ${msg}\n`);
}

// ── Scene pool ────────────────────────────────────────────────────────────
// Setting-only phrases; the card subject clause is appended per item. Picked
// deterministically by news id so each story gets a stable scene but the feed
// stays varied. Add more entries to increase variety.
const SCENES = [
  'a sunny tropical beach at golden hour, with golden sand, turquoise water, a distant boardwalk ferris wheel and seagulls',
  'the spotlit center ring of a vintage circus big-top, with a red-and-gold stage, confetti in the air and a blurred cheering crowd',
  'a chic rooftop cocktail bar at night, with a glittering city skyline bokeh and warm string lights',
  'the grass at center field of a packed sports stadium under bright floodlights, with a roaring blurred crowd in the stands',
  'a cozy retro American diner, with a glossy chrome counter, warm neon signage, a checkerboard floor and vinyl booths',
  'a snowy mountain ski slope at golden hour, with fresh powder snow, pine trees, a timber lodge and sparkling alpenglow light',
  'a neon-soaked retro arcade at night, with glowing pinball machines and vivid magenta and cyan light',
  'a rain-slicked neon city street at night, with shimmering reflections on wet pavement and a cinematic glow',
  'a lush botanical greenhouse at sunrise, with giant tropical leaves, orchids, dewdrops and soft golden light through glass',
  'a colorful carnival midway at dusk, with glowing game booths, a ferris wheel, string lights and a cotton-candy pastel sky',
];

function pickScene(id) {
  const hash = crypto.createHash('md5').update(id).digest();
  return SCENES[hash[0] % SCENES.length];
}

// ── Prompt builders ───────────────────────────────────────────────────────

function buildEditPrompt(scene, cardNames) {
  const subject =
    cardNames.length === 1
      ? `The hero subject is one giant, glossy real credit card standing upright: ${cardNames[0]} (shown in the reference image).`
      : `The hero subjects are ${cardNames.length} giant, glossy real credit cards standing together, one per reference image in order: ${cardNames
          .map((n, i) => `(${i + 1}) ${n}`)
          .join(', ')}.`;
  return [
    `A hyper-realistic, cinematic wide photograph set at ${scene}.`,
    subject,
    `Reproduce each card's real artwork, exact colors, and logos faithfully and keep them clearly recognizable — do NOT redesign the cards, do NOT change their colors, and do NOT add any fake text, numbers, or extra logos.`,
    `The cards should dominate the composition, larger than life, and read instantly even at thumbnail size.`,
    `Warm dramatic lighting, shallow depth of field, editorial finance-magazine energy.`,
    `Absolutely no added text, captions, headlines, or watermarks anywhere in the image.`,
  ].join(' ');
}

function buildThemePrompt(scene, item) {
  return [
    `A hyper-realistic, cinematic wide photograph set at ${scene}.`,
    `The hero subject is a single sleek, glossy credit card standing upright, larger than life, catching the light.`,
    `The mood playfully nods to this credit-card news headline: "${item.title}".`,
    `Warm dramatic lighting, shallow depth of field, editorial finance-magazine energy.`,
    `Absolutely no text, captions, headlines, numbers, or watermarks anywhere in the image.`,
  ].join(' ');
}

// ── OpenAI ────────────────────────────────────────────────────────────────

// Retry transient OpenAI/CDN failures (5xx incl. Cloudflare 520, 429 rate
// limits, and dropped connections) with exponential backoff. Client errors
// (4xx — bad request, moderation_blocked, auth) are NOT retryable and rethrow
// immediately so the caller's fallback logic can run. Without this, a single
// transient 520 permanently leaves a news item with no hero image (and the
// social post goes out image-less).
async function withRetry(fn, { attempts = 4, baseMs = 2000, label = 'openai' } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err.message || '';
      const retryable =
        /HTTP 5\d\d|HTTP 429|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network|socket hang up/i.test(
          msg
        );
      if (!retryable || i === attempts) break;
      const delay = baseMs * 2 ** (i - 1);
      log(`  ${label} attempt ${i}/${attempts} failed (${msg.slice(0, 80)}) — retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function fetchCardBuffer(filename) {
  try {
    const res = await fetch(`${CARD_CDN}/${filename}`);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// EDITS: real card art in, scene out. Cards stay faithful.
async function callOpenAIEdit(prompt, cards) {
  if (!openaiKey) throw new Error('OPENAI_API_KEY not set — cannot generate');
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('size', '1536x1024');
  form.append('quality', quality);
  form.append('input_fidelity', 'high');
  form.append('n', '1');
  for (const c of cards) {
    form.append('image[]', new Blob([c.buf], { type: 'image/png' }), c.filename);
  }
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error(`No image: ${JSON.stringify(json).slice(0, 300)}`);
  return Buffer.from(b64, 'base64');
}

// GENERATIONS: for news items with no associated card art.
async function callOpenAIGenerate(prompt) {
  if (!openaiKey) throw new Error('OPENAI_API_KEY not set — cannot generate');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size: '1536x1024',
      quality,
      n: 1,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error(`No image: ${JSON.stringify(json).slice(0, 300)}`);
  return Buffer.from(b64, 'base64');
}

async function generateNewsImage(item) {
  const scene = pickScene(item.id);
  const links = (item.card_image_links || []).slice(0, MAX_CARDS);
  const names = (item.card_names || []).slice(0, links.length);

  // Fetch the real card art; drop any that 404.
  const cards = [];
  for (let i = 0; i < links.length; i++) {
    const buf = await fetchCardBuffer(links[i]);
    if (buf) cards.push({ buf, filename: links[i], name: names[i] || `card ${i + 1}` });
  }

  let buf;
  if (cards.length > 0) {
    try {
      buf = await withRetry(
        () => callOpenAIEdit(buildEditPrompt(scene, cards.map((c) => c.name)), cards),
        { label: `edit ${item.id}` }
      );
    } catch (err) {
      // Some card art (licensed IP / characters, e.g. Disney) trips OpenAI's
      // moderation when passed as a reference image. Fall back to the card-less
      // text-to-image scene so the item still gets a hero image.
      if (/moderation_blocked|safety system/i.test(err.message)) {
        log(`  edit moderation-blocked for ${item.id} — falling back to card-less scene`);
        buf = await withRetry(() => callOpenAIGenerate(buildThemePrompt(scene, item)), {
          label: `generate ${item.id}`,
        });
      } else {
        throw err;
      }
    }
  } else {
    buf = await withRetry(() => callOpenAIGenerate(buildThemePrompt(scene, item)), {
      label: `generate ${item.id}`,
    });
  }
  const tmp = path.join(os.tmpdir(), `news-${item.id}.png`);
  fs.writeFileSync(tmp, buf);
  return tmp;
}

// ── S3 ────────────────────────────────────────────────────────────────────

function s3HasObject(key) {
  if (dryRun) return false;
  if (!bucket) throw new Error('S3_IMAGES_BUCKET_NAME not set');
  try {
    execSync(`aws s3api head-object --bucket "${bucket}" --key "${key}"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function uploadToS3(key, localPath) {
  if (dryRun) {
    log(`(dry-run) would upload ${localPath} → s3://${bucket}/${key}`);
    return;
  }
  execSync(
    `aws s3 cp "${localPath}" "s3://${bucket}/${key}" ` +
      `--content-type image/png --cache-control "max-age=86400"`,
    { stdio: 'inherit' }
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(NEWS_JSON)) {
    throw new Error(`${NEWS_JSON} not found — run build:news first`);
  }
  const data = JSON.parse(fs.readFileSync(NEWS_JSON, 'utf8'));
  const items = data.items || data;
  if (!Array.isArray(items)) throw new Error('news.json shape unexpected');

  // Logged every run so the CI output records what a given batch of images
  // actually cost. An accidental `--quality high` is a ~5x bill and is
  // otherwise invisible after the fact.
  log(`model: ${model} | quality: ${quality} | size: 1536x1024`);

  const results = { generated: [], stamped: [], skipped: 0, failed: [] };
  let generatedThisRun = 0;

  for (const item of items) {
    if (!item.id) continue;
    if (onlyId && item.id !== onlyId) continue;

    const key = `${S3_PREFIX}/${item.id}.png`;
    const expected = `${item.id}.png`;
    const force = forceAll || forceIds.has(item.id);

    // Author-provided override in YAML — respect it verbatim.
    if (item.news_image && !force) {
      results.skipped++;
      continue;
    }

    if (!force && s3HasObject(key)) {
      if (item.news_image !== expected) {
        item.news_image = expected;
        results.stamped.push(item.id);
      } else {
        results.skipped++;
      }
      continue;
    }

    if (generatedThisRun >= limit) {
      log(`limit ${limit} reached — stopping (remaining items left unstamped)`);
      break;
    }

    log(`generating for ${item.id}${force ? ' (forced)' : ''} — ${(item.card_image_links || []).slice(0, MAX_CARDS).length} card ref(s)`);
    if (dryRun) {
      item.news_image = expected;
      generatedThisRun++;
      results.generated.push(item.id);
      continue;
    }
    try {
      const localPath = await generateNewsImage(item);
      uploadToS3(key, localPath);
      item.news_image = expected;
      generatedThisRun++;
      results.generated.push(item.id);
    } catch (err) {
      log(`ERROR generating for ${item.id}: ${err.message}`);
      results.failed.push(item.id);
    }
  }

  fs.writeFileSync(NEWS_JSON, JSON.stringify(data, null, 2) + '\n');

  log(
    `done — generated: ${results.generated.length}, stamped from S3: ${results.stamped.length}, ` +
      `skipped: ${results.skipped}, failed: ${results.failed.length}, total: ${items.length}`
  );
  if (results.generated.length) log(`generated: ${results.generated.join(', ')}`);
  if (results.failed.length) {
    log(`FAILED:    ${results.failed.join(', ')}`);
    // Fail the CI step loudly. A swallowed image failure previously let the
    // workflow report "success" and post an image-less social update; blocking
    // the downstream news.json upload / social steps is the safer default.
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
