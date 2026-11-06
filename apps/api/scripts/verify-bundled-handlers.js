// Verify the actual SAM/esbuild artifacts, not just TypeScript source exports.
// The Sentry Lambda layer must be able to replace each entrypoint property.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || '.aws-sam/build');
async function main() {
  for (const [resource, file, name] of [
    ['BestCardForMeFunction', 'best-card-for-me.js', 'BestCardForMeHandler'],
    ['CspReportFunction', 'csp-report.js', 'CspReportHandler'],
  ]) {
    const folder = path.join(root, resource);
    const matches = fs.readdirSync(folder, { recursive: true }).filter(p => path.basename(p) === file);
    assert.equal(matches.length, 1, `Missing/ambiguous entrypoint for ${resource}`);
    const exported = require(path.join(folder, matches[0]));
    const descriptor = Object.getOwnPropertyDescriptor(exported, name);
    assert.equal(descriptor?.configurable, true, `${name} cannot be wrapped by Sentry`);
    assert.equal(descriptor?.writable, true, `${name} must be a writable CommonJS export`);
    const original = exported[name];
    Object.defineProperty(exported, name, { ...descriptor, value: (...args) => original(...args) });
    const result = await exported[name]({ httpMethod: 'OPTIONS' });
    assert.equal(result.statusCode, 204);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    console.log(`PASS ${resource}: configurable handler and CORS preflight`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
