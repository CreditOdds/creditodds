// Track and read compare-pair counts. POST { slugs: [a, b, c?] } increments
// the count for every unordered pair of slugs in the comparison; GET ?slug=X
// returns the top partner slugs most often compared with X (descending count).
//
// Pairs are stored with slug_a < slug_b so (A,B) and (B,A) collapse into a
// single row — see migration 024_create_card_compare_pair_counts.sql.

const mysql = require("../db");

const responseHeaders = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

const SLUG_RE = /^[a-z0-9-]{1,190}$/;
const MAX_SLUGS = 5;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

function unorderedPairs(slugs) {
  const out = [];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const [a, b] = slugs[i] < slugs[j] ? [slugs[i], slugs[j]] : [slugs[j], slugs[i]];
      out.push([a, b]);
    }
  }
  return out;
}

exports.CardCompareEventHandler = async (event) => {
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
        const body = event.body ? JSON.parse(event.body) : {};
        const raw = Array.isArray(body.slugs) ? body.slugs : [];
        const slugs = [...new Set(raw.filter((s) => typeof s === "string" && SLUG_RE.test(s)))];

        if (slugs.length < 2 || slugs.length > MAX_SLUGS) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "slugs must contain 2-" + MAX_SLUGS + " unique valid card slugs" }),
          };
          break;
        }

        // Filter out obvious bots — same heuristic as card-view
        const userAgent = event.headers?.["User-Agent"] || event.headers?.["user-agent"] || "";
        if (/bot|crawler|spider|scraper/i.test(userAgent)) {
          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({ success: true, skipped: "bot" }),
          };
          break;
        }

        const pairs = unorderedPairs(slugs);
        for (const [a, b] of pairs) {
          await mysql.query(
            `INSERT INTO card_compare_pair_counts (slug_a, slug_b, compare_count, last_seen_at)
             VALUES (?, ?, 1, NOW())
             ON DUPLICATE KEY UPDATE compare_count = compare_count + 1, last_seen_at = NOW()`,
            [a, b]
          );
        }
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ success: true, pairs: pairs.length }),
        };
      } catch (error) {
        console.error("Error tracking compare event:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: "Failed to track compare event" }),
        };
      }
      break;

    case "GET":
      try {
        const slug = event.queryStringParameters?.slug;
        if (!slug || !SLUG_RE.test(slug)) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "slug query parameter required" }),
          };
          break;
        }

        const limitRaw = parseInt(event.queryStringParameters?.limit, 10);
        const limit = Number.isFinite(limitRaw)
          ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT)
          : DEFAULT_LIMIT;

        // Pull from both columns since the pair is stored with slug_a < slug_b.
        // UNION ALL because the same partner can't appear twice (slug != partner).
        const rows = await mysql.query(
          `SELECT partner, compare_count
           FROM (
             SELECT slug_b AS partner, compare_count FROM card_compare_pair_counts WHERE slug_a = ?
             UNION ALL
             SELECT slug_a AS partner, compare_count FROM card_compare_pair_counts WHERE slug_b = ?
           ) AS partners
           ORDER BY compare_count DESC
           LIMIT ?`,
          [slug, slug, limit]
        );
        await mysql.end();

        const partners = rows.map((r) => ({ slug: r.partner, count: Number(r.compare_count) }));

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ slug, partners }),
        };
      } catch (error) {
        console.error("Error fetching compare partners:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: "Failed to fetch compare partners" }),
        };
      }
      break;

    default:
      response = {
        statusCode: 405,
        headers: responseHeaders,
        body: `CardCompareEvent only accepts GET, POST, OPTIONS — you tried: ${event.httpMethod}`,
      };
      break;
  }

  console.info(`response from: ${event.path} statusCode: ${response.statusCode}`);
  return response;
};
