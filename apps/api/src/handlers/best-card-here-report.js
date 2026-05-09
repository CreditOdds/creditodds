// User-submitted report against a Best Card Here merchant recommendation.
// Replaces the old GitHub-issue feedback link so people without a GitHub
// account can flag a wrong category / wrong card / missing merchant in
// two taps. One row per submission; admins read directly from the DB.
const mysql = require("../db");
const { hashIp, getOptionalUserId } = require("../click-identity");

const responseHeaders = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

const VALID_REASONS = new Set([
  "wrong_category",
  "wrong_card",
  "merchant_missing",
  "other",
]);

const NOTES_MAX = 1000;

// Self-heal: if migration 028 hasn't been applied yet, the table won't
// exist and the first POST would 500. Mirror the DDL from
// migrations/028_create_best_card_here_reports.sql.
const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS best_card_here_reports (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(128) NULL,
    ip_hash CHAR(64) NULL,
    reason ENUM('wrong_category','wrong_card','merchant_missing','other') NOT NULL,
    notes VARCHAR(1000) NULL,
    merchant_place_id VARCHAR(128) NULL,
    merchant_name VARCHAR(255) NOT NULL,
    merchant_address VARCHAR(500) NULL,
    merchant_category VARCHAR(80) NULL,
    merchant_distance VARCHAR(20) NULL,
    recommended_card_id INT NULL,
    recommended_card_name VARCHAR(255) NULL,
    rate_label VARCHAR(40) NULL,
    rate_context VARCHAR(160) NULL,
    wallet_size INT NULL,
    user_agent VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created_at (created_at),
    INDEX idx_user_id (user_id),
    INDEX idx_recommended_card_id (recommended_card_id),
    INDEX idx_reason (reason)
  )
`;

let tableEnsured = false;
async function ensureTable() {
  if (tableEnsured) return;
  await mysql.query(ENSURE_TABLE_SQL);
  tableEnsured = true;
}

function trimOrNull(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.substring(0, max) : trimmed;
}

function asPositiveInt(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function asNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

exports.BestCardHereReportHandler = async (event) => {
  console.info("received:", event);

  let response = {};

  switch (event.httpMethod) {
    case "OPTIONS":
      response = {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({ statusText: "OK" }),
      };
      break;

    case "POST":
      try {
        const body = JSON.parse(event.body || "{}");
        const reason = body.reason;
        const merchantName = trimOrNull(body.merchant_name, 255);

        if (!VALID_REASONS.has(reason)) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({
              error: "reason must be one of wrong_category, wrong_card, merchant_missing, other",
            }),
          };
          break;
        }

        if (!merchantName) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "merchant_name is required" }),
          };
          break;
        }

        const userAgent = event.headers?.["User-Agent"] || event.headers?.["user-agent"] || "";
        if (/bot|crawler|spider|scraper/i.test(userAgent)) {
          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({ success: true }),
          };
          break;
        }

        const ip = event.requestContext?.identity?.sourceIp || null;
        const ipHash = hashIp(ip);
        const userId = await getOptionalUserId(event);

        await ensureTable();
        await mysql.query(
          `INSERT INTO best_card_here_reports
             (user_id, ip_hash, reason, notes,
              merchant_place_id, merchant_name, merchant_address,
              merchant_category, merchant_distance,
              recommended_card_id, recommended_card_name,
              rate_label, rate_context,
              wallet_size, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            ipHash,
            reason,
            trimOrNull(body.notes, NOTES_MAX),
            trimOrNull(body.merchant_place_id, 128),
            merchantName,
            trimOrNull(body.merchant_address, 500),
            trimOrNull(body.merchant_category, 80),
            trimOrNull(body.merchant_distance, 20),
            asPositiveInt(body.recommended_card_id),
            trimOrNull(body.recommended_card_name, 255),
            trimOrNull(body.rate_label, 40),
            trimOrNull(body.rate_context, 160),
            asNonNegativeInt(body.wallet_size),
            userAgent ? userAgent.substring(0, 500) : null,
          ]
        );
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ success: true }),
        };
      } catch (error) {
        console.error("Error saving best-card-here report:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: "Failed to save report" }),
        };
      }
      break;

    default:
      response = {
        statusCode: 405,
        headers: responseHeaders,
        body: `BestCardHereReport only accepts POST and OPTIONS, you tried: ${event.httpMethod}`,
      };
      break;
  }

  console.info(`response from: ${event.path} statusCode: ${response.statusCode}`);
  return response;
};
