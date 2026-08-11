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

// The API sits behind CloudFront, so for CloudFront-routed traffic
// requestContext.identity.sourceIp is an edge address, not the visitor: the
// X-Forwarded-For chain reaching the Lambda is
// "<client-supplied…>, <viewer IP>, <CloudFront edge IP>" — the last entry
// appended by the API Gateway hop, the second-to-last being the address
// CloudFront saw as its TCP peer, i.e. the real client.
//
// But the raw execute-api origin is also publicly reachable, and a direct
// caller's chain is "<client-supplied…>, <caller IP>", which puts an
// attacker-chosen value in the second-to-last slot — enough to forge the
// ip_hash dedup on the anonymous ratings endpoint. So XFF is only trusted
// when the request carries the x-origin-verify header the CloudFront
// distribution attaches to origin requests (shared secret via the
// OriginVerifySecret stack param). Anything else falls back to the
// unforgeable TCP peer address in sourceIp. While ORIGIN_VERIFY_SECRET is
// unset the legacy trust-XFF behavior applies unchanged — enable it with
// apps/api/scripts/enable-origin-verify.sh.
function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function getClientIp(event) {
  const sourceIp = event.requestContext?.identity?.sourceIp || null;

  const secret = process.env.ORIGIN_VERIFY_SECRET;
  if (secret) {
    const originHeader =
      event.headers?.["X-Origin-Verify"] || event.headers?.["x-origin-verify"];
    if (!originHeader || !timingSafeEqualStr(originHeader, secret)) {
      // Direct-to-API-Gateway caller: the XFF chain is attacker-controlled.
      return sourceIp;
    }
  }

  const xff =
    event.headers?.["X-Forwarded-For"] || event.headers?.["x-forwarded-for"];
  if (xff) {
    const chain = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (chain.length >= 2) return chain[chain.length - 2];
    if (chain.length === 1) return chain[0];
  }
  return sourceIp;
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

module.exports = { getClientIp, hashIp, getOptionalUserId };
