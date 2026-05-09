// Track outbound apply clicks per card and return aggregated counts.
//
// Click model (current):
//   Every click writes one row to card_apply_clicks with click_source,
//   user_id (Firebase uid, when signed in), ip_hash (sha256(pepper + ip)),
//   user_agent, and created_at. Uniqueness is computed at read time as
//   COUNT(DISTINCT COALESCE(user_id, ip_hash)).
//
// Click model (legacy):
//   The card_apply_click_counts table holds aggregated totals predating the
//   per-row log. It has no per-user info, so no uniqueness can be derived
//   from it. We keep summing it into total counts for historical continuity,
//   but uniques only reflect new (post-rollout) clicks.
const mysql = require("../db");
const { hashIp, getOptionalUserId } = require("../click-identity");

const responseHeaders = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

const VALID_CLICK_SOURCES = new Set(["direct", "referral"]);

// Self-heal: if migration 025 hasn't been applied to this environment yet,
// the per-row log table won't exist and every INSERT/SELECT here would 500
// out, blanking the admin Apply Clicks dashboard. Create-if-missing matches
// the schema in migrations/025_create_card_apply_clicks.sql.
const ENSURE_NEW_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS card_apply_clicks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    card_id INT NOT NULL,
    click_source ENUM('direct', 'referral') NOT NULL DEFAULT 'direct',
    user_id VARCHAR(128) NULL,
    ip_hash CHAR(64) NULL,
    user_agent VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_card_id_created_at (card_id, created_at),
    INDEX idx_created_at (created_at),
    INDEX idx_click_source (click_source),
    INDEX idx_user_id (user_id),
    INDEX idx_ip_hash (ip_hash),
    CONSTRAINT fk_card_apply_clicks_card FOREIGN KEY (card_id) REFERENCES cards(card_id) ON DELETE CASCADE
  )
`;

let newTableEnsured = false;
async function ensureNewClickTable() {
  if (newTableEnsured) return;
  await mysql.query(ENSURE_NEW_TABLE_SQL);
  newTableEnsured = true;
}

exports.CardApplyClickHandler = async (event) => {
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
        const body = JSON.parse(event.body);
        const { card_id, click_source = "direct" } = body;

        if (!card_id || !Number.isInteger(card_id) || card_id <= 0) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "card_id must be a positive integer" }),
          };
          break;
        }

        if (!VALID_CLICK_SOURCES.has(click_source)) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "click_source must be 'direct' or 'referral'" }),
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

        await ensureNewClickTable();
        await mysql.query(
          `INSERT INTO card_apply_clicks
             (card_id, click_source, user_id, ip_hash, user_agent)
           VALUES (?, ?, ?, ?, ?)`,
          [
            card_id,
            click_source,
            userId,
            ipHash,
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
        console.error("Error tracking card apply click:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: "Failed to track apply click" }),
        };
      }
      break;

    case "GET":
      try {
        const period = event.queryStringParameters?.period;
        const clickSource = event.queryStringParameters?.click_source;
        const breakdown = event.queryStringParameters?.breakdown;

        if (clickSource && !VALID_CLICK_SOURCES.has(clickSource)) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "click_source must be 'direct' or 'referral'" }),
          };
          break;
        }

        let days = null;
        if (period && period !== "0") {
          days = Math.min(Math.max(parseInt(period, 10) || 30, 1), 365);
        }

        // --- legacy aggregate (no per-user info) ---
        const legacyParams = [];
        const legacyWhere = [];
        if (days !== null) {
          legacyWhere.push("click_date >= CURDATE() - INTERVAL ? DAY");
          legacyParams.push(days);
        }
        if (clickSource) {
          legacyWhere.push("click_source = ?");
          legacyParams.push(clickSource);
        }
        const legacyWhereClause = legacyWhere.length > 0 ? `WHERE ${legacyWhere.join(" AND ")}` : "";

        // --- new per-row log (uniques computable) ---
        const newParams = [];
        const newWhere = [];
        if (days !== null) {
          newWhere.push("created_at >= NOW() - INTERVAL ? DAY");
          newParams.push(days);
        }
        if (clickSource) {
          newWhere.push("click_source = ?");
          newParams.push(clickSource);
        }
        const newWhereClause = newWhere.length > 0 ? `WHERE ${newWhere.join(" AND ")}` : "";

        if (breakdown === "source") {
          const [legacyResult, newResult] = await Promise.allSettled([
            mysql.query(
              `SELECT card_id, click_source, SUM(click_count) AS clicks
                 FROM card_apply_click_counts
                 ${legacyWhereClause}
                 GROUP BY card_id, click_source`,
              legacyParams
            ),
            mysql.query(
              `SELECT card_id, click_source,
                      COUNT(*) AS clicks,
                      COUNT(DISTINCT COALESCE(user_id, ip_hash)) AS unique_clicks
                 FROM card_apply_clicks
                 ${newWhereClause}
                 GROUP BY card_id, click_source`,
              newParams
            ),
          ]);
          await mysql.end();
          if (legacyResult.status === "rejected") {
            console.warn("legacy click_counts query failed:", legacyResult.reason?.message);
          }
          if (newResult.status === "rejected") {
            console.warn("card_apply_clicks query failed:", newResult.reason?.message);
          }
          const legacyRows = legacyResult.status === "fulfilled" ? legacyResult.value : [];
          const newRows = newResult.status === "fulfilled" ? newResult.value : [];

          const clicks = {};
          const ensure = (id) => {
            if (!clicks[id]) {
              clicks[id] = {
                direct: 0,
                referral: 0,
                total: 0,
                unique_direct: 0,
                unique_referral: 0,
                unique_total: 0,
              };
            }
            return clicks[id];
          };

          for (const row of legacyRows) {
            const e = ensure(row.card_id);
            const count = Number(row.clicks);
            e[row.click_source] += count;
            e.total += count;
          }
          for (const row of newRows) {
            const e = ensure(row.card_id);
            const count = Number(row.clicks);
            const uniq = Number(row.unique_clicks);
            e[row.click_source] += count;
            e.total += count;
            e[`unique_${row.click_source}`] += uniq;
            e.unique_total += uniq;
          }

          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({ clicks }),
          };
          break;
        }

        const [legacyResult, newResult] = await Promise.allSettled([
          mysql.query(
            `SELECT card_id, SUM(click_count) AS clicks
               FROM card_apply_click_counts
               ${legacyWhereClause}
               GROUP BY card_id`,
            legacyParams
          ),
          mysql.query(
            `SELECT card_id,
                    COUNT(*) AS clicks,
                    COUNT(DISTINCT COALESCE(user_id, ip_hash)) AS unique_clicks
               FROM card_apply_clicks
               ${newWhereClause}
               GROUP BY card_id`,
            newParams
          ),
        ]);
        await mysql.end();
        if (legacyResult.status === "rejected") {
          console.warn("legacy click_counts query failed:", legacyResult.reason?.message);
        }
        if (newResult.status === "rejected") {
          console.warn("card_apply_clicks query failed:", newResult.reason?.message);
        }
        const legacyRows = legacyResult.status === "fulfilled" ? legacyResult.value : [];
        const newRows = newResult.status === "fulfilled" ? newResult.value : [];

        const clicks = {};
        const uniqueClicks = {};
        for (const row of legacyRows) {
          clicks[row.card_id] = (clicks[row.card_id] || 0) + Number(row.clicks);
        }
        for (const row of newRows) {
          clicks[row.card_id] = (clicks[row.card_id] || 0) + Number(row.clicks);
          uniqueClicks[row.card_id] = Number(row.unique_clicks);
        }

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ clicks, unique_clicks: uniqueClicks }),
        };
      } catch (error) {
        console.error("Error fetching card apply clicks:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: "Failed to fetch apply clicks" }),
        };
      }
      break;

    default:
      response = {
        statusCode: 405,
        headers: responseHeaders,
        body: `CardApplyClick only accepts GET and POST methods, you tried: ${event.httpMethod}`,
      };
      break;
  }

  console.info(`response from: ${event.path} statusCode: ${response.statusCode}`);
  return response;
};
