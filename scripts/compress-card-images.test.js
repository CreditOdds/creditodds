// End-to-end test for compress-card-images.js: a second consecutive run must
// report zero files rewritten.
//
// Why this exists on top of the unit tests in scripts/lib/compress-image.test.js:
// the failure that shipped was invisible at the call site. compressPngInPlace's
// skip guard asked sharp for a metadata field that sharp no longer emits, so
// the check quietly evaluated false for every file and the script re-quantised
// all ~180 card images on every run — each pass throwing away more colour, and
// each pass dragging the whole directory into the diff. The script is documented
// as the thing to run after adding new art, so following the instructions was
// what degraded the set.
//
// The unit tests cover the guard's logic; this one covers the promise the
// docstring actually makes, through the real CLI, on real encoder output.
//
// Run: `node scripts/compress-card-images.test.js`. Exits non-zero on failure.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sharp = require('sharp');

const SCRIPT = path.join(__dirname, 'compress-card-images.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compress-card-images-test-'));

const digest = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const listing = (dir) =>
  Object.fromEntries(fs.readdirSync(dir).map((f) => [f, digest(path.join(dir, f))]));

// Flat colour quantises to a stable palette on the first pass, which would hide
// the bug. Noise leaves enough distinct colours that a second pass has more to
// throw away — which is what the real card art looks like to the encoder.
async function writeSource(dir, name, { width, height = 400, format = 'png', palette = false }) {
  const px = Buffer.alloc(width * height * 3);
  for (let i = 0; i < px.length; i++) px[i] = (i * 2654435761) % 256;
  const img = sharp(px, { raw: { width, height, channels: 3 } });
  const file = path.join(dir, name);
  await (format === 'png' ? img.png({ palette }) : img.jpeg()).toFile(file);
  return file;
}

const run = (dir, args = []) =>
  execFileSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CARD_IMAGES_DIR: dir },
  });

// "N file(s) scanned, M rewritten, K already at target"
function parseSummary(out) {
  const m = out.match(/(\d+) file\(s\) scanned, (\d+) (?:rewritten|to re-encode), (\d+) already at target/);
  assert.ok(m, `could not parse summary from:\n${out}`);
  return { scanned: +m[1], changed: +m[2], skipped: +m[3] };
}

let failures = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// A directory that mirrors what data/cards/images/ actually holds: oversized
// press-kit art, art already at the target, and the odd file that is not really
// a PNG despite the extension.
async function makeImagesDir(name) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir);
  await writeSource(dir, 'oversized.png', { width: 2400 });
  await writeSource(dir, 'truecolor.png', { width: 600 });
  await writeSource(dir, 'already-palette.png', { width: 500, palette: true });
  await writeSource(dir, 'actually-jpeg.png', { width: 500, format: 'jpeg' });
  return dir;
}

test('a second consecutive run rewrites nothing', async () => {
  const dir = await makeImagesDir('second-run');

  const first = parseSummary(run(dir));
  assert.equal(first.scanned, 4);
  assert.ok(first.changed > 0, 'first run should have had work to do');

  const before = listing(dir);
  const second = parseSummary(run(dir));

  assert.equal(second.changed, 0, 'second run rewrote files');
  assert.equal(second.skipped, second.scanned, 'every file should be at target');
  assert.deepEqual(listing(dir), before, 'second run changed bytes on disk');
});

test('a third run is still a no-op', async () => {
  // One clean pass could be luck — a file that happens to re-encode identically.
  // The regression was compounding, so check it stays put.
  const dir = await makeImagesDir('third-run');
  run(dir);
  run(dir);
  const before = listing(dir);
  const third = parseSummary(run(dir));
  assert.equal(third.changed, 0);
  assert.deepEqual(listing(dir), before);
});

test('--dry-run reports nothing to re-encode after a real run', async () => {
  const dir = await makeImagesDir('dry-run');
  run(dir);
  const before = listing(dir);

  const dry = parseSummary(run(dir, ['--dry-run']));
  assert.equal(dry.changed, 0, '--dry-run found work after a completed run');
  assert.equal(dry.skipped, dry.scanned);
  assert.deepEqual(listing(dir), before, '--dry-run wrote to disk');
});

test('--dry-run does see work on an untouched directory', async () => {
  // Otherwise the assertion above would pass just as well against a dry run
  // that reports nothing no matter what — which is what it used to do.
  const dir = await makeImagesDir('dry-run-pending');
  const before = listing(dir);
  const dry = parseSummary(run(dir, ['--dry-run']));
  assert.ok(dry.changed > 0, '--dry-run reported no work on uncompressed art');
  assert.deepEqual(listing(dir), before, '--dry-run wrote to disk');
});

test('--force re-encodes files a plain run would skip', async () => {
  const dir = await makeImagesDir('forced');
  run(dir);
  const forced = parseSummary(run(dir, ['--force']));
  assert.ok(forced.changed > 0, '--force skipped everything');
});

test('new art is compressed without disturbing the files already there', async () => {
  // The scenario from the bug report: one image added to a settled directory.
  const dir = await makeImagesDir('new-art');
  run(dir);
  const before = listing(dir);

  await writeSource(dir, 'brand-new-card.png', { width: 1800 });
  const out = run(dir);
  const summary = parseSummary(out);

  assert.equal(summary.changed, 1, `expected exactly the new file to change:\n${out}`);
  for (const [file, hash] of Object.entries(before)) {
    assert.equal(digest(path.join(dir, file)), hash, `${file} was rewritten`);
  }
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ok   ${name}`);
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
