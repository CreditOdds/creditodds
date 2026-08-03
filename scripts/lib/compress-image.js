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
 * @param {{maxWidth?: number, quality?: number}} [opts]
 * @returns {Promise<{before: number, after: number, changed: boolean, converted: boolean}>}
 */
async function compressPngInPlace(filePath, opts = {}) {
  const { maxWidth = EDITORIAL_MAX_WIDTH, quality = 90 } = opts;
  const before = fs.statSync(filePath).size;
  const meta = await sharp(filePath).metadata();

  // Every caller here writes .png and uploads under Content-Type image/png, so
  // a file whose bytes are not actually PNG is served under a type it does not
  // match. Browsers sniff past it, but nothing else is obliged to.
  const converted = meta.format !== 'png';

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
  if (buf.length >= before && !converted) {
    return { before, after: before, changed: false, converted: false };
  }
  fs.writeFileSync(filePath, buf);
  return { before, after: buf.length, changed: true, converted };
}

module.exports = {
  compressPngInPlace,
  CARD_MAX_WIDTH,
  EDITORIAL_MAX_WIDTH,
};
