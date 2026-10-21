// Shared firebase-admin initialization.
//
// Token *verification* (the API Gateway authorizer) works with just a project
// id because it only fetches Google's public certificates. Privileged Admin
// API calls — auth().listUsers(), auth().deleteUser() — need real service
// account credentials, supplied as base64-encoded service-account JSON in
// FIREBASE_SERVICE_ACCOUNT_B64 (stack param FirebaseServiceAccountB64).
// Without it those calls fail with a credential error at call time; callers
// that treat that as best-effort keep working as before.

const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

function initFirebase() {
  if (getApps().length) return getAuth();

  const projectId = process.env.FIREBASE_PROJECT_ID || 'creditodds';
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64 || '';

  if (b64) {
    const serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    initializeApp({
      credential: cert(serviceAccount),
      projectId,
    });
  } else {
    initializeApp({ projectId });
  }
  return getAuth();
}

module.exports = { initFirebase };
