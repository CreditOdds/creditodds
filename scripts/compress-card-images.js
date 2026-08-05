#!/usr/bin/env node
/**
 * Compress the card art in data/cards/images/ in place.
 *
 * Card sources arrive straight from issuer press kits at up to 2400px and
 * 2.6 MB, but nothing on the site renders a card wider than ~260 CSS px. On a
 * cold cache the image optimizer still has to pull and decode the whole source
 * to emit a 4 KB thumbnail, so the extra weight is pure first-paint latency.
 *
 * Safe to re-run: a file already at the target (palette PNG, no wider than
 * CARD_MAX_WIDTH) is skipped outright, so repeated runs are a no-op and the
 * diff stays limited to whatever art you just added. This matters because
 * quantisation is lossy and cumulative — before the skip existed, every run
 * re-quantised all ~175 images and quietly degraded them another notch.
 *
 * Run it after dropping new card art into data/cards/images/.
 *
 * Usage:
 *   node scripts/compress-card-images.js [--dry-run] [--force]
 *
 *   --force  re-encode even files already at the target. Only for a deliberate
 *            requantisation of the whole set; it degrades every image it touches.
 */

const fs = require('fs');
const path = require('path');
const { compressPngInPlace, CARD_MAX_WIDTH } = require('./lib/compress-image');

const IMAGES_DIR = path.join(__dirname, '..', 'data', 'cards', 'images');
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

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
  let skippedCount = 0;

  if (force) {
    process.stdout.write(
      'WARNING: --force re-quantises files already at the target, which degrades them.\n',
    );
  }

  for (const file of files) {
    const full = path.join(IMAGES_DIR, file);
    const before = fs.statSync(full).size;
    totalBefore += before;

    if (dryRun) {
      totalAfter += before;
      continue;
    }

    try {
      const res = await compressPngInPlace(full, { maxWidth: CARD_MAX_WIDTH, force });
      totalAfter += res.after;
      if (res.skipped) skippedCount++;
      if (res.changed) {
        changedCount++;
        // A conversion normally grows the file, so say why rather than let it
        // read as a compression pass that went backwards.
        const note = res.converted ? ' (was not PNG, re-encoded)' : '';
        process.stdout.write(`  ${file}: ${kb(res.before)} → ${kb(res.after)}${note}\n`);
      }
    } catch (err) {
      // A single unreadable file should not abandon the rest of the batch.
      totalAfter += before;
      process.stdout.write(`  SKIP ${file}: ${err.message}\n`);
    }
  }

  process.stdout.write(
    `\n${files.length} file(s) scanned, ${changedCount} rewritten, ` +
      `${skippedCount} already at target\n` +
      `total ${kb(totalBefore)} → ${kb(totalAfter)}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
