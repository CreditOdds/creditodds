// Track card page views and return view counts
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

exports.CardViewHandler = async (event) => {
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
        const { card_id } = body;

        if (!card_id || !Number.isInteger(card_id) || card_id <= 0) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "card_id must be a positive integer" }),
          };
          break;
        }

        // Filter out obvious bots
        const userAgent = event.headers?.['User-Agent'] || event.headers?.['user-agent'] || '';
        if (/bot|crawler|spider|scraper/i.test(userAgent)) {
          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({ success: true }),
          };
          break;
        }

        await mysql.query(
          `INSERT INTO card_view_counts (card_id, view_date, view_count)
           VALUES (?, CURDATE(), 1)
           ON DUPLICATE KEY UPDATE view_count = view_count + 1`,
          [card_id]
        );
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ success: true }),
        };
      } catch (error) {
        console.error("Error tracking card view:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: "Failed to track view" }),
        };
      }
      break;

    case "GET":
      try {
        const period = event.queryStringParameters?.period;
        let rows;

        if (period && period !== '0') {
          const days = Math.min(Math.max(parseInt(period, 10) || 30, 1), 365);
          rows = await mysql.query(
            `SELECT card_id, SUM(view_count) AS views
             FROM card_view_counts
             WHERE view_date >= CURDATE() - INTERVAL ? DAY
             GROUP BY card_id`,
            [days]
          );
        } else {
          rows = await mysql.query(
            `SELECT card_id, SUM(view_count) AS views
             FROM card_view_counts
             GROUP BY card_id`
          );
        }
        await mysql.end();

        const views = {};
        for (const row of rows) {
          views[row.card_id] = Number(row.views);
        }

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ views }),
        };
      } catch (error) {
        console.error("Error fetching view counts:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: "Failed to fetch view counts" }),
        };
      }
      break;

    default:
      response = {
        statusCode: 405,
        headers: responseHeaders,
        body: `CardView only accepts GET and POST methods, you tried: ${event.httpMethod}`,
      };
      break;
  }

  console.info(`response from: ${event.path} statusCode: ${response.statusCode}`);
  return response;
};
