// Run against native Node (Lambda's runtime), since Jest's VM on Node 22 does
// not implement require(esm) used by the installed Firebase Admin SDK.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('modular Firebase initialization exposes all used Auth APIs and reuses the app', () => {
  const source = `
    const assert = require('node:assert/strict');
    const { initFirebase } = require('./src/lib/firebase-init');
    const { getApps } = require('firebase-admin/app');
    const auth = initFirebase();
    assert.equal(initFirebase(), auth);
    assert.equal(getApps().length, 1);
    for (const name of ['verifyIdToken', 'listUsers', 'getUser', 'deleteUser', 'setCustomUserClaims']) assert.equal(typeof auth[name], 'function');
    console.log('ok');
  `;
  expect(execFileSync(process.execPath, ['-e', source], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8',
    env: { ...process.env, FIREBASE_SERVICE_ACCOUNT_B64: '', GOOGLE_APPLICATION_CREDENTIALS: '' },
  }).trim()).toBe('ok');
});
