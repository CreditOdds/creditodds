// Record self-reported application outcomes from the post-apply check-in
// prompt on card pages, and return aggregated counts.
//
// Outcome model:
//   One row per (card_id, identity_key) where identity_key is the Firebase
//   uid when signed in, else the peppered ip_hash — the same identity scheme
//   card_apply_clicks uses, so the two tables join for funnel analysis
//   (clicks -> answered -> outcome). Re-answering upserts in place, which
//   both lets a "pending" later resolve to "approved" and caps one outcome
//   per visitor per card (spam guard). When neither uid nor ip_hash is
//   available identity_key is NULL; MySQL unique keys allow repeated NULLs,
//   so those rows still record but don't dedupe.
//
//   These are anonymous tier-1 signals. They do NOT feed the public odds
//   charts — full data points live in the records table.
const mysql = require("../db");
const { getClientIp, hashIp, getOptionalUserId } = require("../click-identity");

const responseHeaders = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

const VALID_OUTCOMES = new Set(["approved", "denied", "pending", "just_looking"]);

// Self-heal: matches the schema in migrations/041_create_apply_outcomes.sql
// so the endpoint works even before the migration has been applied to this
// environment (same pattern as card-apply-click.js).
const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS apply_outcomes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    card_id INT NOT NULL,
    outcome ENUM('approved', 'denied', 'pending', 'just_looking') NOT NULL,
    user_id VARCHAR(128) NULL,
    ip_hash CHAR(64) NULL,
    identity_key VARCHAR(128) NULL,
    user_agent VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_card_identity (card_id, identity_key),
    INDEX idx_card_id_created_at (card_id, created_at),
    INDEX idx_created_at (created_at),
    INDEX idx_outcome (outcome),
    INDEX idx_user_id (user_id),
    CONSTRAINT fk_apply_outcomes_card FOREIGN KEY (card_id) REFERENCES cards(card_id) ON DELETE CASCADE
  )
`;

let tableEnsured = false;
async function ensureTable() {
  if (tableEnsured) return;
  await mysql.query(ENSURE_TABLE_SQL);
  tableEnsured = true;
}

exports.ApplyOutcomeHandler = async (event) => {
  console.info("received:", event.httpMethod, event.path);

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
        const body = JSON.parse(event.body);
        const { card_id, outcome } = body;

        if (!card_id || !Number.isInteger(card_id) || card_id <= 0) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "card_id must be a positive integer" }),
          };
          break;
        }

        if (!VALID_OUTCOMES.has(outcome)) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({
              error: "outcome must be 'approved', 'denied', 'pending', or 'just_looking'",
            }),
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

        const ip = getClientIp(event);
        const ipHash = hashIp(ip);
        const userId = await getOptionalUserId(event);
        const identityKey = userId || ipHash;

        await ensureTable();
        await mysql.query(
          `INSERT INTO apply_outcomes
             (card_id, outcome, user_id, ip_hash, identity_key, user_agent)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             outcome = VALUES(outcome),
             user_id = VALUES(user_id),
             ip_hash = VALUES(ip_hash),
             user_agent = VALUES(user_agent)`,
          [
            card_id,
            outcome,
            userId,
            ipHash,
            identityKey,
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
        console.error("Error recording apply outcome:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: "Failed to record apply outcome" }),
        };
      }
      break;

    case "GET":
      try {
        const period = event.queryStringParameters?.period;

        let days = null;
        if (period && period !== "0") {
          days = Math.min(Math.max(parseInt(period, 10) || 30, 1), 365);
        }

        const params = [];
        let whereClause = "";
        if (days !== null) {
          whereClause = "WHERE updated_at >= NOW() - INTERVAL ? DAY";
          params.push(days);
        }

        await ensureTable();
        const rows = await mysql.query(
          `SELECT card_id, outcome, COUNT(*) AS count
             FROM apply_outcomes
             ${whereClause}
             GROUP BY card_id, outcome`,
          params
        );
        await mysql.end();

        const outcomes = {};
        for (const row of rows) {
          if (!outcomes[row.card_id]) {
            outcomes[row.card_id] = {
              approved: 0,
              denied: 0,
              pending: 0,
              just_looking: 0,
              total: 0,
            };
          }
          const count = Number(row.count);
          outcomes[row.card_id][row.outcome] += count;
          outcomes[row.card_id].total += count;
        }

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ outcomes }),
        };
      } catch (error) {
        console.error("Error fetching apply outcomes:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: "Failed to fetch apply outcomes" }),
        };
      }
      break;

    default:
      response = {
        statusCode: 405,
        headers: responseHeaders,
        body: `ApplyOutcome only accepts GET and POST methods, you tried: ${event.httpMethod}`,
      };
      break;
  }

  console.info(`response from: ${event.path} statusCode: ${response.statusCode}`);
  return response;
};
