// Track editorial (article + news) page views and return view counts.
// Mirrors card-view.js, but keys rows by content_type + content_key (string)
// since articles/news live in JSON, not the cards table.
const mysql = require("../db");

const responseHeaders = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

const VALID_TYPES = ["article", "news"];

exports.ContentViewHandler = async (event) => {
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
        const { content_type, content_key } = body;

        if (!VALID_TYPES.includes(content_type)) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "content_type must be 'article' or 'news'" }),
          };
          break;
        }
        if (typeof content_key !== "string" || !content_key || content_key.length > 191) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "content_key must be a non-empty string (<=191 chars)" }),
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
          `INSERT INTO content_view_counts (content_type, content_key, view_date, view_count)
           VALUES (?, ?, CURDATE(), 1)
           ON DUPLICATE KEY UPDATE view_count = view_count + 1`,
          [content_type, content_key]
        );
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ success: true }),
        };
      } catch (error) {
        console.error("Error tracking content view:", error);
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
        const typeFilter = event.queryStringParameters?.type;

        const where = [];
        const params = [];
        if (period && period !== '0') {
          const days = Math.min(Math.max(parseInt(period, 10) || 7, 1), 365);
          where.push(`view_date >= CURDATE() - INTERVAL ? DAY`);
          params.push(days);
        }
        if (VALID_TYPES.includes(typeFilter)) {
          where.push(`content_type = ?`);
          params.push(typeFilter);
        }
        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const rows = await mysql.query(
          `SELECT content_type, content_key, SUM(view_count) AS views
           FROM content_view_counts
           ${whereSql}
           GROUP BY content_type, content_key`,
          params
        );
        await mysql.end();

        // Nested map: { article: { slug: count }, news: { id: count } }
        const views = { article: {}, news: {} };
        for (const row of rows) {
          if (!views[row.content_type]) views[row.content_type] = {};
          views[row.content_type][row.content_key] = Number(row.views);
        }

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ views }),
        };
      } catch (error) {
        console.error("Error fetching content view counts:", error);
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
        body: `ContentView only accepts GET and POST methods, you tried: ${event.httpMethod}`,
      };
      break;
  }

  console.info(`response from: ${event.path} statusCode: ${response.statusCode}`);
  return response;
};
