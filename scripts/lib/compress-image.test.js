// Tests for compressPngInPlace, chiefly that it is idempotent.
//
// Why this exists: palette quantisation is lossy AND cumulative. Re-quantising
// an already-quantised image throws away more colour and lands on a *smaller*
// file, so the "keep whichever is smaller" guard reads that as a win and
// rewrites. The failure is silent and compounding — measured on the real card
// set, four passes took chase-freedom.png from 58k to 32k, and every run of
// compress-card-images.js also dragged ~166 untouched files into the diff and
// the S3 sync. A byte-identical second pass is the property that matters here.
//
// Run: `node scripts/lib/compress-image.test.js`. Exits non-zero on failure.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sharp = require('sharp');
const { compressPngInPlace, CARD_MAX_WIDTH } = require('./compress-image');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compress-image-test-'));
const digest = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// Flat colour blocks quantise to a stable palette immediately, which would hide
// the bug. Noise keeps enough distinct colours that a second pass has something
// left to throw away, which is what the real card art looks like to the encoder.
async function makeSource(name, { width, height = 400, palette = false, format = 'png' }) {
  const px = Buffer.alloc(width * height * 3);
  for (let i = 0; i < px.length; i++) px[i] = (i * 2654435761) % 256;
  const img = sharp(px, { raw: { width, height, channels: 3 } });
  const file = path.join(tmp, name);
  await (format === 'png' ? img.png({ palette }) : img.jpeg()).toFile(file);
  return file;
}

let failures = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('a second pass is byte-identical', async () => {
  const f = await makeSource('idempotent.png', { width: 1400 });
  await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH });
  const afterFirst = digest(f);
  const res = await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH });
  assert.equal(res.changed, false, 'second pass rewrote the file');
  assert.equal(res.skipped, true, 'second pass should report skipped');
  assert.equal(digest(f), afterFirst, 'bytes changed on the second pass');
});

test('repeated passes never shrink the file further', async () => {
  // The regression this guards: sizes used to decline on every run.
  const f = await makeSource('stable.png', { width: 1400 });
  await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH });
  const size = fs.statSync(f).size;
  for (let i = 0; i < 3; i++) await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH });
  assert.equal(fs.statSync(f).size, size, 'file kept shrinking across passes');
});

test('an oversized image is still resized on the first pass', async () => {
  const f = await makeSource('oversized.png', { width: 2400 });
  const res = await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH });
  assert.equal(res.changed, true);
  assert.equal(res.skipped, false);
  assert.equal((await sharp(f).metadata()).width, CARD_MAX_WIDTH);
});

test('an oversized palette PNG is not skipped', async () => {
  // Already quantised but too wide: the width still has to come down, so the
  // palette marker alone must not be enough to skip.
  const f = await makeSource('wide-palette.png', { width: 2000, palette: true });
  const res = await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH });
  assert.equal(res.skipped, false);
  assert.equal((await sharp(f).metadata()).width, CARD_MAX_WIDTH);
});

test('a truecolor PNG under the target is compressed once, then stable', async () => {
  const f = await makeSource('truecolor.png', { width: 600 });
  const first = await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH });
  assert.equal(first.changed, true, 'truecolor source should be quantised');
  const second = await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH });
  assert.equal(second.skipped, true);
});

test('a mislabelled non-PNG is always converted, even when small', async () => {
  // wells_fargo_active_cash.png really is a JPEG, and is served as image/png.
  // Correctness outweighs bytes, so this must rewrite regardless of size.
  const f = await makeSource('actually-jpeg.png', { width: 500, format: 'jpeg' });
  const res = await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH });
  assert.equal(res.converted, true);
  assert.equal(res.changed, true);
  assert.equal(res.skipped, false);
  assert.equal((await sharp(f).metadata()).format, 'png');
});

test('a converted file settles on the next pass', async () => {
  const f = await makeSource('jpeg-settles.png', { width: 500, format: 'jpeg' });
  await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH });
  const res = await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH });
  assert.equal(res.skipped, true, 'a converted file must not re-convert forever');
});

test('force re-encodes a file that would otherwise be skipped', async () => {
  const f = await makeSource('forced.png', { width: 1400 });
  await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH });
  const skipped = await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH });
  assert.equal(skipped.skipped, true);
  const forced = await compressPngInPlace(f, { maxWidth: CARD_MAX_WIDTH, force: true });
  assert.equal(forced.skipped, false, 'force must bypass the skip');
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (err) {
      failures++;
      console.error(`  FAIL ${name}\n       ${err.message}`);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
})();
