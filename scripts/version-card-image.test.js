const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { versionCardImage } = require('./version-card-image');
test('identical art keeps its URL; replacement art gets a new URL and retains the old artifact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creditodds-art-'));
  try {
    const output = path.join(dir, 'output');
    fs.writeFileSync(path.join(dir, 'card.png'), 'first');
    const first = versionCardImage('card.png', dir, output);
    assert.equal(versionCardImage('card.png', dir, output), first);
    fs.writeFileSync(path.join(dir, 'card.png'), 'updated');
    const second = versionCardImage('card.png', dir, output);
    assert.notEqual(second, first);
    assert.equal(fs.readFileSync(path.join(output, first), 'utf8'), 'first');
    assert.equal(fs.readFileSync(path.join(output, second), 'utf8'), 'updated');
    assert.equal(versionCardImage('legacy.png', dir, output), 'legacy.png');
    assert.throws(() => versionCardImage('../outside.png', dir, output), /Invalid/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
