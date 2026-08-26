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

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const PNG_COLOR_TYPE_PALETTE = 3;

/**
 * True when `buf` holds a PNG whose IHDR declares colour type 3 (palette).
 *
 * Read from the bytes rather than from sharp's metadata on purpose. The first
 * version of this guard asked `meta.paletteBitDepth !== undefined`, which is a
 * field sharp stopped emitting; the check then silently evaluated false for
 * every file, nothing was ever skipped, and each run re-quantised the whole
 * card set. Absence of a metadata key is indistinguishable from "not a
 * palette", so that shape of check fails open — towards re-encoding — and does
 * it without a word. The IHDR layout is fixed by the PNG spec, so this cannot
 * drift out from under us on a dependency bump.
 *
 * @param {Buffer} buf
 * @returns {boolean}
 */
function isPalettePng(buf) {
  // signature(8) + chunk length(4) + type(4) + width(4) + height(4)
  // + bit depth(1) + colour type(1): 26 bytes before the answer is readable.
  if (buf.length < 26) return false;
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
  // IHDR is required by the spec to be the first chunk.
  if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') return false;
  return buf[25] === PNG_COLOR_TYPE_PALETTE;
}

/**
 * Whether `filePath` is already a palette PNG no wider than `maxWidth`, i.e.
 * whether compressPngInPlace would skip it. Cheap — it reads the header, it
 * does not encode — so a dry run can classify the whole set quickly.
 *
 * @param {string} filePath
 * @param {{maxWidth?: number}} [opts]
 * @returns {Promise<boolean>}
 */
async function isAtTarget(filePath, opts = {}) {
  const { maxWidth = EDITORIAL_MAX_WIDTH } = opts;
  const source = fs.readFileSync(filePath);
  if (!isPalettePng(source)) return false;
  const meta = await sharp(source).metadata();
  return (meta.width || 0) <= maxWidth;
}

/**
 * @param {string} filePath  PNG to rewrite in place.
 * @param {{maxWidth?: number, quality?: number, force?: boolean}} [opts]
 * @returns {Promise<{before: number, after: number, changed: boolean, converted: boolean, skipped: boolean}>}
 */
async function compressPngInPlace(filePath, opts = {}) {
  const { maxWidth = EDITORIAL_MAX_WIDTH, quality = 90, force = false } = opts;
  const source = fs.readFileSync(filePath);
  const before = source.length;
  const meta = await sharp(source).metadata();

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
  // and doing it again can only take something away. Colour type 3 in the IHDR
  // is an exact marker of our own output; see isPalettePng for why this reads
  // the header instead of trusting a sharp metadata field.
  const oversized = (meta.width || 0) > maxWidth;
  const alreadyAtTarget = isPalettePng(source) && !oversized;
  if (alreadyAtTarget && !force) {
    return { before, after: before, changed: false, converted: false, skipped: true };
  }

  const buf = await sharp(source)
    .resize({
      width: Math.min(meta.width || maxWidth, maxWidth),
      withoutEnlargement: true,
    })
    .png({ palette: true, quality, effort: 9 })
    .toBuffer();

  // The skip above only holds if what we write is actually recognisable as the
  // target on the next run. If the encoder ever stops emitting a palette — a
  // sharp build without libimagequant quietly ignores `palette: true` — then
  // every future run would re-encode this file forever, which is the exact
  // silent, compounding degradation this module exists to prevent. Refuse to
  // write instead, and say why.
  if (!isPalettePng(buf)) {
    throw new Error(
      `${filePath}: palette encode produced a non-palette PNG, so this file ` +
        'would be re-quantised on every future run. Refusing to write. This ' +
        'usually means the installed sharp has no quantisation support.'
    );
  }

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
  isAtTarget,
  isPalettePng,
  CARD_MAX_WIDTH,
  EDITORIAL_MAX_WIDTH,
};
