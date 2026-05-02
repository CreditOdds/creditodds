#!/usr/bin/env node
/**
 * sync-article-images.js
 *
 * For each article in data/articles.json, ensures a hero image exists in S3 at
 * `article_images/<slug>.png`. If the article's YAML already sets `image:`, that
 * filename is preserved. Otherwise:
 *   1. Check S3 for `<slug>.png` — if present, just stamp the field on articles.json.
 *   2. If missing, generate via OpenAI gpt-image-1 in the locked CreditOdds dark-ink
 *      style, upload to S3, and stamp the field.
 *
 * Modifies data/articles.json in place so the uploaded copy carries the new fields.
 *
 * Env:
 *   OPENAI_API_KEY                       (required when any generation is needed)
 *   S3_IMAGES_BUCKET_NAME                (required for uploads — same bucket as card_images)
 *   CLOUDFRONT_IMAGES_DISTRIBUTION_ID    (optional — invalidates regenerated image paths if set;
 *                                         brand-new slugs at brand-new paths don't need invalidation)
 *
 * Flags:
 *   --force <slug>     Regenerate this slug even if S3 already has it.
 *   --force-all        Regenerate every article (expensive — workflow_dispatch only).
 *   --dry-run          Log what would happen, but don't call OpenAI or S3.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const ARTICLES_JSON = path.join(__dirname, '..', 'data', 'articles.json');
const S3_PREFIX = 'article_images';
// CloudFront distribution that fronts the images bucket (same one used by card_images).
// Only used to build invalidation paths when --force is set.
const CDN_DISTRIBUTION_ID = process.env.CLOUDFRONT_IMAGES_DISTRIBUTION_ID;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const forceAll = args.includes('--force-all');
const forceSlugs = new Set(
  args
    .map((a, i) => (a === '--force' ? args[i + 1] : null))
    .filter(Boolean)
);

const bucket = process.env.S3_IMAGES_BUCKET_NAME;
const distributionId = CDN_DISTRIBUTION_ID;
const openaiKey = process.env.OPENAI_API_KEY;

function log(msg) {
  process.stdout.write(`[sync-article-images] ${msg}\n`);
}

function s3KeyFor(slug) {
  return `${S3_PREFIX}/${slug}.png`;
}

function s3HasObject(slug) {
  if (dryRun) return false;
  if (!bucket) throw new Error('S3_IMAGES_BUCKET_NAME not set');
  try {
    execSync(
      `aws s3api head-object --bucket "${bucket}" --key "${s3KeyFor(slug)}"`,
      { stdio: 'pipe' }
    );
    return true;
  } catch {
    return false;
  }
}

function uploadToS3(slug, localPath) {
  if (dryRun) {
    log(`(dry-run) would upload ${localPath} to s3://${bucket}/${s3KeyFor(slug)}`);
    return;
  }
  execSync(
    `aws s3 cp "${localPath}" "s3://${bucket}/${s3KeyFor(slug)}" ` +
      `--content-type image/png --cache-control "max-age=86400"`,
    { stdio: 'inherit' }
  );
}

function invalidate(slugs) {
  if (!distributionId || slugs.length === 0 || dryRun) return;
  const paths = slugs.map((s) => `/${s3KeyFor(s)}`).join(' ');
  execSync(
    `aws cloudfront create-invalidation --distribution-id ${distributionId} --paths ${paths}`,
    { stdio: 'inherit' }
  );
}

// Locked-in CreditOdds dark-ink prompt template. Keep prompt deterministic — only
// the per-article CONCEPT block varies, so style stays consistent across the library.
const STYLE = `
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

function buildPrompt(article) {
  const concept = article.image_concept
    ? article.image_concept
    : `Concept: an editorial illustration evoking the topic of "${article.title}".\n` +
      `Context: ${article.summary}\n` +
      `Use abstract geometric forms — credit cards, arrows, ribbons, circles, simple ` +
      `iconography appropriate to the topic. The composition should read at thumbnail size.`;
  return `${concept}\n\n${STYLE}`;
}

async function generateImage(article) {
  if (dryRun) {
    log(`(dry-run) would generate image for ${article.slug}`);
    return null;
  }
  if (!openaiKey) throw new Error('OPENAI_API_KEY not set — cannot generate');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: buildPrompt(article),
      size: '1536x1024',
      quality: 'medium',
      n: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error(`No image in response: ${JSON.stringify(json).slice(0, 300)}`);
  const tmp = path.join(os.tmpdir(), `${article.slug}.png`);
  fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
  return tmp;
}

async function main() {
  if (!fs.existsSync(ARTICLES_JSON)) {
    throw new Error(`${ARTICLES_JSON} not found — run build:articles first`);
  }
  const articlesData = JSON.parse(fs.readFileSync(ARTICLES_JSON, 'utf8'));
  const articles = articlesData.articles || articlesData;
  if (!Array.isArray(articles)) throw new Error('articles.json shape unexpected');

  const generated = [];
  const stamped = [];

  for (const article of articles) {
    const { slug } = article;
    if (!slug) continue;

    const userSetImage = article.image && !forceSlugs.has(slug) && !forceAll;
    if (userSetImage) continue;

    const expectedFilename = `${slug}.png`;
    const force = forceAll || forceSlugs.has(slug);

    if (!force && s3HasObject(slug)) {
      if (article.image !== expectedFilename) {
        article.image = expectedFilename;
        stamped.push(slug);
      }
      continue;
    }

    log(`generating image for ${slug}${force ? ' (forced)' : ''}`);
    try {
      const localPath = await generateImage(article);
      if (localPath) uploadToS3(slug, localPath);
      article.image = expectedFilename;
      generated.push(slug);
    } catch (err) {
      log(`ERROR generating ${slug}: ${err.message}`);
    }
  }

  fs.writeFileSync(ARTICLES_JSON, JSON.stringify(articlesData, null, 2) + '\n');
  invalidate(generated);

  log(
    `done — generated: ${generated.length}, stamped from existing S3: ${stamped.length}, ` +
      `total articles: ${articles.length}`
  );
  if (generated.length) log(`generated slugs: ${generated.join(', ')}`);
  if (stamped.length) log(`stamped slugs:   ${stamped.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
