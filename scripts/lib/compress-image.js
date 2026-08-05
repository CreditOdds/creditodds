/**
 * Shrink a PNG in place before it is uploaded to S3.
 *
 * Every image on the site is served through the Next.js image optimizer, which
 * emits a small AVIF. But on a cache miss the optimizer has to fetch and decode
 * the *full* source first, so an oversized PNG shows up directly as first-paint
 * latency — a 2.5 MB source to produce a 4 KB thumbnail. Card art was arriving
 * at up to 2000px / 2.6 MB and the AI-generated editorial images at ~2.5 MB.
 *
 * Palette quantisation at quality 90 measured visually indistinguishable on
 * both flat card art (gradients, foil logos, rounded alpha edges) and the
 * photographic editorial images, at roughly 3-10x smaller.
 *
 * Idempotent: a file already at the target (palette PNG, no wider than
 * maxWidth) is left untouched, because quantising it again would degrade it
 * further rather than find more slack. Pass `force` to re-encode anyway.
 */

const fs = require('fs');
const sharp = require('sharp');

// Card art never renders wider than ~260 CSS px, so 1000 leaves generous retina
// headroom. Editorial art renders up to 1080 CSS px and is generated at 1536,
// so it is re-encoded at native size rather than scaled down.
const CARD_MAX_WIDTH = 1000;
const EDITORIAL_MAX_WIDTH = 1600;

/**
 * @param {string} filePath  PNG to rewrite in place.
 * @param {{maxWidth?: number, quality?: number, force?: boolean}} [opts]
 * @returns {Promise<{before: number, after: number, changed: boolean, converted: boolean, skipped: boolean}>}
 */
async function compressPngInPlace(filePath, opts = {}) {
  const { maxWidth = EDITORIAL_MAX_WIDTH, quality = 90, force = false } = opts;
  const before = fs.statSync(filePath).size;
  const meta = await sharp(filePath).metadata();

  // Every caller here writes .png and uploads under Content-Type image/png, so
  // a file whose bytes are not actually PNG is served under a type it does not
  // match. Browsers sniff past it, but nothing else is obliged to.
  const converted = meta.format !== 'png';

  // Quantisation is lossy AND cumulative: re-quantising an already-quantised
  // image throws away more colour every pass and lands on a *smaller* file, so
  // the "keep whichever is smaller" guard below never fires and each run
  // silently degrades the image again. Measured on the card set, four passes
  // took chase-freedom.png from 58k to 32k — that is not 45% of wasted bytes
  // found, it is 45% of the picture destroyed.
  //
  // So the operation has to be "ensure this file is a palette PNG no wider than
  // maxWidth", not "quantise this file". A file already in that state is done,
  // and doing it again can only take something away. `paletteBitDepth` is set
  // only on palette PNGs, which makes it an exact marker of our own output.
  const oversized = (meta.width || 0) > maxWidth;
  const alreadyAtTarget = !converted && meta.paletteBitDepth !== undefined && !oversized;
  if (alreadyAtTarget && !force) {
    return { before, after: before, changed: false, converted: false, skipped: true };
  }

  const buf = await sharp(filePath)
    .resize({
      width: Math.min(meta.width || maxWidth, maxWidth),
      withoutEnlargement: true,
    })
    .png({ palette: true, quality, effort: 9 })
    .toBuffer();

  // Re-encoding is not guaranteed to win: an already-tuned small PNG can come
  // back bigger. Keep whichever is smaller so this is always safe to run.
  //
  // Except when the source was not PNG. PNG cannot beat WebP or AVIF on the
  // same image, so the re-encode always loses and this guard would keep the
  // mismatched bytes forever, which is how a WebP and an AVIF both sat in
  // data/cards/images/ under .png names through a full compression pass.
  // Correctness outweighs the bytes, so a mismatch always rewrites.
  //
  // Same reasoning for an oversized source. The point of the resize is to bound
  // what the image optimizer has to decode on a cache miss, and that cost is
  // set by the pixels, not the file size. Letting a few bytes veto the resize
  // would strand a 2400px source at 2400px forever and leave it re-encoded and
  // re-vetoed on every run.
  if (buf.length >= before && !converted && !oversized) {
    return { before, after: before, changed: false, converted: false, skipped: false };
  }
  fs.writeFileSync(filePath, buf);
  return { before, after: buf.length, changed: true, converted, skipped: false };
}

module.exports = {
  compressPngInPlace,
  CARD_MAX_WIDTH,
  EDITORIAL_MAX_WIDTH,
};
