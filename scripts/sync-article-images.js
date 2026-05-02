#!/usr/bin/env node
/**
 * sync-article-images.js
 *
 * For each article in data/articles.json, ensures TWO hero images exist on S3:
 *   1. `article_images/<slug>.png`         — editorial dark-ink illustration used
 *                                             on the site (article hero + listing)
 *   2. `article_images/<slug>-social.png`  — composite social card (realistic photo
 *                                             of a person + brand panel with title);
 *                                             used as the article's OG image so it
 *                                             unfurls on Twitter/LinkedIn
 *
 * Either image can be overridden by setting `image:` or `social_image:` in the
 * article's YAML — those filenames are preserved verbatim. Otherwise the script
 *   1. Checks S3 for the conventional filename — stamps the field if present
 *   2. If missing, generates and uploads via OpenAI gpt-image-1
 *
 * The social variant uses the cheap composite path: AI generates only the photo
 * (~$0.04, medium quality), then SVG is composited via sharp for the brand panel
 * with article-specific title and tag eyebrow.
 *
 * Modifies data/articles.json in place so the uploaded copy carries the new fields.
 *
 * Env:
 *   OPENAI_API_KEY                       (required when any generation is needed)
 *   S3_IMAGES_BUCKET_NAME                (required for uploads — same bucket as card_images)
 *   CLOUDFRONT_IMAGES_DISTRIBUTION_ID    (optional — invalidates regenerated paths if set)
 *
 * Flags:
 *   --force <slug>     Regenerate this slug's images even if S3 already has them.
 *   --force-all        Regenerate every article (expensive — workflow_dispatch only).
 *   --skip-editorial   Only sync social images.
 *   --skip-social      Only sync editorial images.
 *   --dry-run          Log what would happen, but don't call OpenAI or S3.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const crypto = require('crypto');
const sharp = require('sharp');

const ARTICLES_JSON = path.join(__dirname, '..', 'data', 'articles.json');
const S3_PREFIX = 'article_images';
const CDN_DISTRIBUTION_ID = process.env.CLOUDFRONT_IMAGES_DISTRIBUTION_ID;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const forceAll = args.includes('--force-all');
const skipEditorial = args.includes('--skip-editorial');
const skipSocial = args.includes('--skip-social');
const forceSlugs = new Set(
  args.map((a, i) => (a === '--force' ? args[i + 1] : null)).filter(Boolean)
);

const bucket = process.env.S3_IMAGES_BUCKET_NAME;
const openaiKey = process.env.OPENAI_API_KEY;

function log(msg) {
  process.stdout.write(`[sync-article-images] ${msg}\n`);
}

// ── S3 helpers ────────────────────────────────────────────────────────────

function s3HasObject(key) {
  if (dryRun) return false;
  if (!bucket) throw new Error('S3_IMAGES_BUCKET_NAME not set');
  try {
    execSync(`aws s3api head-object --bucket "${bucket}" --key "${key}"`, {
      stdio: 'pipe',
    });
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

function invalidate(keys) {
  if (!CDN_DISTRIBUTION_ID || keys.length === 0 || dryRun) return;
  const paths = keys.map((k) => `/${k}`).join(' ');
  execSync(
    `aws cloudfront create-invalidation --distribution-id ${CDN_DISTRIBUTION_ID} --paths ${paths}`,
    { stdio: 'inherit' }
  );
}

// ── OpenAI image generation ───────────────────────────────────────────────

async function callOpenAI(prompt, opts = {}) {
  const { quality = 'medium', size = '1536x1024' } = opts;
  if (!openaiKey) throw new Error('OPENAI_API_KEY not set — cannot generate');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size, quality, n: 1 }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error(`No image: ${JSON.stringify(json).slice(0, 300)}`);
  return Buffer.from(b64, 'base64');
}

// ── Editorial illustration (existing dark-ink style) ──────────────────────

const EDITORIAL_STYLE = `
THE ENTIRE IMAGE BACKGROUND IS A SOLID DEEP INDIGO-BLACK (#1a1330) RECTANGLE filling
every pixel edge to edge with no white margins, borders, or padding. This is a DARK
MODE illustration — the canvas itself is deep indigo-black. Treat the background as
the most important constraint.

Editorial flat vector illustration in CreditOdds brand style.
Strict palette only:
  - background: deep indigo-black #1a1330
  - primary shapes: brand purple #6d3fe8 and pale lavender #f0e9ff
  - accents: bright purple #8b5cf6 and soft white highlights
  - linework: pale lavender #c4b5fd at 2px
Absolutely no other colors — no greens, blues, reds, yellows, oranges, browns,
no white background.
Geometric shapes, clean outlines, generous negative space, modern fintech editorial
aesthetic — NYT business section illustration crossed with minimalist SaaS marketing.
No photorealism, no 3D, no glossy effects.
ABSOLUTELY NO TEXT, NO LETTERS, NO NUMBERS, NO PUNCTUATION SYMBOLS (no %, no $, no #,
no digits) anywhere in the image. If you would draw a symbol, replace it with abstract
geometric shapes.
Wide landscape composition.
`.trim();

function buildEditorialPrompt(article) {
  const concept = article.image_concept
    ? article.image_concept
    : `Concept: an editorial illustration evoking the topic of "${article.title}".\n` +
      `Context: ${article.summary}\n` +
      `Use abstract geometric forms — credit cards, arrows, ribbons, circles, simple ` +
      `iconography appropriate to the topic. The composition should read at thumbnail size.`;
  return `${concept}\n\n${EDITORIAL_STYLE}`;
}

async function generateEditorialImage(article) {
  if (dryRun) {
    log(`(dry-run) would generate editorial image for ${article.slug}`);
    return null;
  }
  const buf = await callOpenAI(buildEditorialPrompt(article));
  const tmp = path.join(os.tmpdir(), `${article.slug}.png`);
  fs.writeFileSync(tmp, buf);
  return tmp;
}

// ── Social composite (AI photo + SVG brand panel) ─────────────────────────

// Subject pool — picked deterministically by slug hash so each article gets a
// stable subject, but the feed varies across articles. Add more entries to
// increase variety. Each description ends after the clothing — the rest of the
// prompt slots in expression, composition, etc.
const SUBJECT_POOL = [
  'a woman in her late 20s with light brown hair, wearing a beige knit sweater',
  'a man in his early 30s with short dark hair and stubble, wearing a navy button-down shirt',
  'a woman in her mid 30s with shoulder-length straight black hair (East Asian features), wearing a cream blazer over a white tee',
  'a man in his late 20s with a short well-groomed beard (Black / African American), wearing a heather grey crewneck sweater',
  'a woman in her early 30s with blonde hair pulled into a loose bun, wearing a soft pink button-down',
  'a man in his mid 30s with short black hair and tortoise-shell glasses (Hispanic / Latino), wearing a denim shirt',
  'a woman in her late 20s with curly dark hair (South Asian features), wearing a forest green knit top',
  'a man in his late 20s with sandy blonde hair and a clean shave, wearing a charcoal-grey sweater',
];

function pickSubject(slug) {
  const hash = crypto.createHash('md5').update(slug).digest();
  return SUBJECT_POOL[hash[0] % SUBJECT_POOL.length];
}

function buildSocialPhotoPrompt(article) {
  const subject = article.social_image_subject || pickSubject(article.slug);
  return `
A wide horizontal editorial portrait photograph (3:2 aspect ratio) for a finance
publication.

Subject: ${subject}, holding a small fan of three credit cards in one hand at
chest or collarbone level (NOT up by face), with an expression of EXAGGERATED
shock and elation, like they cannot believe what they just figured out — wide
eyes, mouth open in a surprised "OH MY GOD" expression, eyebrows raised, free
hand pressed to cheek or hovering near open mouth in disbelief. Genuinely
thrilled, not scared — pure "this is too good to be true" energy. The expression
should be the FOCAL POINT and read clearly even at thumbnail size.

Composition rules (CRITICAL — follow exactly):
  - The subject occupies the LEFT HALF of the frame, NOT centered. Their face
    is in the left third; their hand with the cards is held at CHEST or
    COLLARBONE level, positioned in the lower-left quadrant of the frame so
    the cards do NOT extend past the horizontal center of the image.
  - The RIGHT HALF of the frame is COMPLETELY EMPTY — only soft pale neutral
    wall/background, no objects, no body parts, no cards, no text. This empty
    area is reserved for an overlay panel that will be added in post.
  - Warm window light from upper left, soft shallow depth of field, modern
    editorial photography style.
  - The cards are stylized blank purple cards (no readable text or logos).

ABSOLUTELY NO text, letters, words, numbers, or graphic overlays anywhere in
the image. The photo is purely a portrait against a clean background.
`.trim();
}

// Break a title into N short lines for the side panel. Greedy by word, max
// chars per line is the constraint. The panel can comfortably fit up to 5
// lines, so we only ellipsize titles that genuinely don't fit.
function breakTitleIntoLines(title, maxCharsPerLine = 17, maxLines = 5) {
  const words = title.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const truncated = lines.slice(0, maxLines);
    truncated[maxLines - 1] = truncated[maxLines - 1].replace(/[,;:]?$/, '') + '…';
    return truncated;
  }
  return lines;
}

// Pick the headline shown on the social panel. Prefer an explicit
// `social_title:` from YAML; otherwise default to the title-before-colon
// (e.g. "Balance Transfer Cards: How They Work…" → "Balance Transfer Cards").
function getSocialHeadline(article) {
  if (article.social_title) return article.social_title;
  const colonIdx = article.title.indexOf(':');
  if (colonIdx > 0) return article.title.slice(0, colonIdx).trim();
  return article.title;
}

// XML-escape title text destined for SVG
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Map article tag to the eyebrow label rendered on the panel.
const TAG_EYEBROWS = {
  guide: 'GUIDE',
  strategy: 'STRATEGY',
  analysis: 'ANALYSIS',
  beginner: 'BEGINNER',
  'news-analysis': 'NEWS',
};

function getEyebrow(article) {
  const tag = (article.tags || [])[0];
  return TAG_EYEBROWS[tag] || 'CREDITODDS';
}

const PANEL_W = 614; // 40% of 1536
const PANEL_H = 1024;

function buildSocialPanelSvg(article) {
  const lines = breakTitleIntoLines(getSocialHeadline(article));
  const eyebrow = getEyebrow(article);
  const HEAD_SIZE = 60;
  const HEAD_LH = 72;
  const HEAD_TOP = 220;
  const PAD_X = 56;
  const FONT = "-apple-system, 'Helvetica Neue', Arial, sans-serif";
  const headlineEndY = HEAD_TOP + (lines.length - 1) * HEAD_LH;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_W}" height="${PANEL_H}" viewBox="0 0 ${PANEL_W} ${PANEL_H}">
  <defs>
    <radialGradient id="glow1" cx="85%" cy="15%" r="55%">
      <stop offset="0%" stop-color="#6d3fe8" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#6d3fe8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="10%" cy="90%" r="50%">
      <stop offset="0%" stop-color="#6d3fe8" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#6d3fe8" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#ffffff" fill-opacity="0.06"/>
    </pattern>
  </defs>

  <rect width="${PANEL_W}" height="${PANEL_H}" fill="#1a1330"/>
  <rect width="${PANEL_W}" height="${PANEL_H}" fill="url(#dots)"/>
  <rect width="${PANEL_W}" height="${PANEL_H}" fill="url(#glow1)"/>
  <rect width="${PANEL_W}" height="${PANEL_H}" fill="url(#glow2)"/>

  <rect x="${PAD_X}" y="120" width="80" height="6" fill="#8b5cf6"/>

  <text x="${PAD_X}" y="172" font-family="${FONT}" font-size="24" font-weight="700"
        letter-spacing="4" fill="#c4b5fd">${escapeXml(eyebrow)}</text>

  ${lines
    .map(
      (line, i) =>
        `<text x="${PAD_X}" y="${HEAD_TOP + i * HEAD_LH}" font-family="${FONT}" font-size="${HEAD_SIZE}" ` +
        `font-weight="700" letter-spacing="-2" fill="#ffffff">${escapeXml(line)}</text>`
    )
    .join('\n  ')}

  <line x1="${PAD_X}" y1="${headlineEndY + 36}" x2="${PAD_X + 100}" y2="${headlineEndY + 36}"
        stroke="#c4b5fd" stroke-opacity="0.55" stroke-width="1.5"/>

  <text x="${PAD_X}" y="${headlineEndY + 84}" font-family="${FONT}" font-size="26"
        font-weight="500" fill="#c4b5fd">creditodds.com</text>
</svg>
`.trim();
}

async function generateSocialImage(article) {
  if (dryRun) {
    log(`(dry-run) would generate social image for ${article.slug}`);
    return null;
  }
  const photoBuf = await callOpenAI(buildSocialPhotoPrompt(article));
  const panelSvg = buildSocialPanelSvg(article);
  const tmp = path.join(os.tmpdir(), `${article.slug}-social.png`);
  await sharp(photoBuf)
    .composite([
      {
        input: Buffer.from(panelSvg),
        left: 1536 - PANEL_W,
        top: 0,
      },
    ])
    .png()
    .toFile(tmp);
  return tmp;
}

// ── Per-variant orchestration ─────────────────────────────────────────────

const VARIANTS = {
  editorial: {
    field: 'image',
    keyFor: (slug) => `${S3_PREFIX}/${slug}.png`,
    filenameFor: (slug) => `${slug}.png`,
    generate: generateEditorialImage,
    skip: skipEditorial,
  },
  social: {
    field: 'social_image',
    keyFor: (slug) => `${S3_PREFIX}/${slug}-social.png`,
    filenameFor: (slug) => `${slug}-social.png`,
    generate: generateSocialImage,
    skip: skipSocial,
  },
};

async function syncVariant(variantName, articles, results) {
  const variant = VARIANTS[variantName];
  if (variant.skip) {
    log(`skipping ${variantName} (--skip-${variantName})`);
    return;
  }

  for (const article of articles) {
    const { slug } = article;
    if (!slug) continue;

    const force = forceAll || forceSlugs.has(slug);
    const userSet = article[variant.field] && !force;
    if (userSet) continue;

    const expected = variant.filenameFor(slug);
    const key = variant.keyFor(slug);

    if (!force && s3HasObject(key)) {
      if (article[variant.field] !== expected) {
        article[variant.field] = expected;
        results.stamped.push(`${variantName}:${slug}`);
      }
      continue;
    }

    log(`generating ${variantName} for ${slug}${force ? ' (forced)' : ''}`);
    try {
      const localPath = await variant.generate(article);
      if (localPath) uploadToS3(key, localPath);
      article[variant.field] = expected;
      results.generated.push(key);
    } catch (err) {
      log(`ERROR generating ${variantName} for ${slug}: ${err.message}`);
    }
  }
}

async function main() {
  if (!fs.existsSync(ARTICLES_JSON)) {
    throw new Error(`${ARTICLES_JSON} not found — run build:articles first`);
  }
  const articlesData = JSON.parse(fs.readFileSync(ARTICLES_JSON, 'utf8'));
  const articles = articlesData.articles || articlesData;
  if (!Array.isArray(articles)) throw new Error('articles.json shape unexpected');

  const results = { generated: [], stamped: [] };

  await syncVariant('editorial', articles, results);
  await syncVariant('social', articles, results);

  fs.writeFileSync(ARTICLES_JSON, JSON.stringify(articlesData, null, 2) + '\n');
  invalidate(results.generated);

  log(
    `done — generated: ${results.generated.length}, stamped from existing S3: ${results.stamped.length}, ` +
      `total articles: ${articles.length}`
  );
  if (results.generated.length) log(`generated keys: ${results.generated.join(', ')}`);
  if (results.stamped.length) log(`stamped:        ${results.stamped.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
