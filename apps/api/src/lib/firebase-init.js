// Shared firebase-admin initialization.
//
// Token *verification* (the API Gateway authorizer) works with just a project
// id because it only fetches Google's public certificates. Privileged Admin
// API calls — auth().listUsers(), auth().deleteUser() — need real service
// account credentials, supplied as base64-encoded service-account JSON in
// FIREBASE_SERVICE_ACCOUNT_B64 (stack param FirebaseServiceAccountB64).
// Without it those calls fail with a credential error at call time; callers
// that treat that as best-effort keep working as before.

const admin = require('firebase-admin');

function initFirebase() {
  if (admin.apps.length) return admin;

  const projectId = process.env.FIREBASE_PROJECT_ID || 'creditodds';
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64 || '';

  if (b64) {
    const serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  } else {
    admin.initializeApp({ projectId });
  }
  return admin;
}

module.exports = { initFirebase };
