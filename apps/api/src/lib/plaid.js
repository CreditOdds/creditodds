// Plaid client + access_token encryption helpers.
//
// Plaid's `access_token` is a long-lived bearer credential (tied to an Item until
// the user revokes it). RDS-at-rest encryption protects against disk theft but not
// against an SQL-injection or read-only-replica leak, so we encrypt these tokens
// at the application layer with AES-256-GCM. The key is a CFN NoEcho parameter
// (PlaidEncryptionKey) — 64 hex chars (32 bytes).
//
// Storage layout in user_plaid_items.access_token_encrypted (VARBINARY):
//   [12-byte IV][16-byte auth tag][ciphertext...]
//
// Rotating the key requires re-encrypting every existing token; not built yet.

const crypto = require('crypto');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
  const hex = process.env.PLAID_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('PLAID_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

function encryptToken(plaintext) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

function decryptToken(buf) {
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function getPlaidClient() {
  const env = process.env.PLAID_ENV || 'sandbox';
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set');
  }
  const basePath = PlaidEnvironments[env];
  if (!basePath) {
    throw new Error(`Unknown PLAID_ENV: ${env}`);
  }
  return new PlaidApi(new Configuration({
    basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  }));
}

module.exports = { getPlaidClient, encryptToken, decryptToken };
