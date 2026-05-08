// Helpers for tagging anonymous click events with stable identity:
//   - hashIp: SHA-256(pepper + ip), giving a stable per-IP token without
//     storing raw addresses. The pepper is a static server-side secret;
//     rotating it resets all uniqueness chains by design.
//   - getOptionalUserId: tries to extract a Firebase uid from the
//     Authorization header. Returns null on missing/invalid token — these
//     endpoints accept anonymous callers, so failure is not fatal.

const crypto = require("crypto");

let firebaseAdmin = null;
function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin;
  try {
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || "creditodds",
      });
    }
    firebaseAdmin = admin;
    return admin;
  } catch (err) {
    console.warn("firebase-admin not available:", err.message);
    return null;
  }
}

function hashIp(ip) {
  if (!ip) return null;
  const pepper = process.env.IP_HASH_PEPPER;
  if (!pepper) {
    console.warn("IP_HASH_PEPPER not set; skipping ip hash");
    return null;
  }
  return crypto.createHash("sha256").update(pepper + ip).digest("hex");
}

async function getOptionalUserId(event) {
  const authHeader =
    event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader) return null;
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  if (!token) return null;

  const admin = getFirebaseAdmin();
  if (!admin) return null;

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid || null;
  } catch (err) {
    console.warn("Firebase token verification failed:", err.message);
    return null;
  }
}

module.exports = { hashIp, getOptionalUserId };
