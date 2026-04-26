// Track outbound apply clicks per card and return aggregated counts
const mysql = require("serverless-mysql")({
  config: {
    host: process.env.ENDPOINT,
    database: process.env.DATABASE,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
  },
});

const responseHeaders = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

const VALID_CLICK_SOURCES = new Set(["direct", "referral"]);
const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS card_apply_click_counts (
    card_id INT NOT NULL,
    click_date DATE NOT NULL,
    click_source ENUM('direct', 'referral') NOT NULL DEFAULT 'direct',
    click_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (card_id, click_date, click_source),
    INDEX idx_click_date (click_date),
    INDEX idx_click_source (click_source),
    CONSTRAINT fk_card_apply_click_card FOREIGN KEY (card_id) REFERENCES cards(card_id) ON DELETE CASCADE
  )
`;

async function ensureCardApplyClickTable() {
  await mysql.query(ENSURE_TABLE_SQL);
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

        await ensureCardApplyClickTable();
        await mysql.query(
          `INSERT INTO card_apply_click_counts (card_id, click_date, click_source, click_count)
           VALUES (?, CURDATE(), ?, 1)
           ON DUPLICATE KEY UPDATE click_count = click_count + 1`,
          [card_id, click_source]
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

        const params = [];
        const where = [];

        if (period && period !== "0") {
          const days = Math.min(Math.max(parseInt(period, 10) || 30, 1), 365);
          where.push("click_date >= CURDATE() - INTERVAL ? DAY");
          params.push(days);
        }

        if (clickSource) {
          where.push("click_source = ?");
          params.push(clickSource);
        }

        const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
        await ensureCardApplyClickTable();

        if (breakdown === "source") {
          const rows = await mysql.query(
            `SELECT card_id, click_source, SUM(click_count) AS clicks
             FROM card_apply_click_counts
             ${whereClause}
             GROUP BY card_id, click_source`,
            params
          );
          await mysql.end();

          const clicks = {};
          for (const row of rows) {
            const id = row.card_id;
            if (!clicks[id]) clicks[id] = { direct: 0, referral: 0, total: 0 };
            const count = Number(row.clicks);
            clicks[id][row.click_source] = count;
            clicks[id].total += count;
          }

          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({ clicks }),
          };
          break;
        }

        const rows = await mysql.query(
          `SELECT card_id, SUM(click_count) AS clicks
           FROM card_apply_click_counts
           ${whereClause}
           GROUP BY card_id`,
          params
        );
        await mysql.end();

        const clicks = {};
        for (const row of rows) {
          clicks[row.card_id] = Number(row.clicks);
        }

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ clicks }),
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
