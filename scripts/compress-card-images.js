#!/usr/bin/env node
/**
 * Compress the card art in data/cards/images/ in place.
 *
 * Card sources arrive straight from issuer press kits at up to 2400px and
 * 2.6 MB, but nothing on the site renders a card wider than ~260 CSS px. On a
 * cold cache the image optimizer still has to pull and decode the whole source
 * to emit a 4 KB thumbnail, so the extra weight is pure first-paint latency.
 *
 * Safe to re-run: images already at or below the target come back unchanged.
 * Run it after dropping new card art into data/cards/images/.
 *
 * Usage:
 *   node scripts/compress-card-images.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { compressPngInPlace, CARD_MAX_WIDTH } = require('./lib/compress-image');

const IMAGES_DIR = path.join(__dirname, '..', 'data', 'cards', 'images');
const dryRun = process.argv.includes('--dry-run');

const kb = (n) => `${(n / 1024).toFixed(0)}k`;

async function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    throw new Error(`${IMAGES_DIR} not found`);
  }
  // PNG only. S3 derives Content-Type from the extension, so re-encoding a
  // .jpeg to PNG bytes in place would leave it served as image/jpeg.
  const files = fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => /\.png$/i.test(f))
    .sort();

  let totalBefore = 0;
  let totalAfter = 0;
  let changedCount = 0;

  for (const file of files) {
    const full = path.join(IMAGES_DIR, file);
    const before = fs.statSync(full).size;
    totalBefore += before;

    if (dryRun) {
      totalAfter += before;
      continue;
    }

    try {
      const res = await compressPngInPlace(full, { maxWidth: CARD_MAX_WIDTH });
      totalAfter += res.after;
      if (res.changed) {
        changedCount++;
        process.stdout.write(`  ${file}: ${kb(res.before)} → ${kb(res.after)}\n`);
      }
    } catch (err) {
      // A single unreadable file should not abandon the rest of the batch.
      totalAfter += before;
      process.stdout.write(`  SKIP ${file}: ${err.message}\n`);
    }
  }

  process.stdout.write(
    `\n${files.length} file(s) scanned, ${changedCount} rewritten\n` +
      `total ${kb(totalBefore)} → ${kb(totalAfter)}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
