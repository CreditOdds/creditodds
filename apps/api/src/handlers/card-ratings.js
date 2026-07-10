const mysql = require("../db");
const { getClientIp, hashIp, getOptionalUserId } = require("../click-identity");

const COMMENT_MAX = 2000;

function normalizeComment(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > COMMENT_MAX ? trimmed.substring(0, COMMENT_MAX) : trimmed;
}

const responseHeaders = {
  // Authenticated, user-specific responses: never cache at browser or any
  // shared edge (CloudFront/proxy). Belt-and-suspenders for routing the API
  // through a CDN without leaking one user's data to another.
  "Cache-Control": "no-store",
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

// Resolve a card_name to its numeric card_id
async function resolveCardId(cardName) {
  const rows = await mysql.query(
    `SELECT card_id FROM cards WHERE card_name = ? OR card_name = ? LIMIT 1`,
    [cardName, cardName.replace(/ Card$/, '')]
  );
  return rows.length > 0 ? rows[0].card_id : null;
}

// GET /ratings?card_name=Chase+Sapphire+Preferred — public, returns avg + count

// Cacheable headers for public GET reads: lets CloudFront/browser cache
// successful responses (s-maxage matches the 300s ISR/stats cadence). Applied
// only to 200 reads, never to errors or authenticated/POST responses.
const cacheableHeaders = {
  ...responseHeaders,
  "Cache-Control": "public, max-age=60, s-maxage=300",
};

exports.CardRatingsHandler = async (event) => {
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

    case "GET":
      try {
        const cardName = event.queryStringParameters?.card_name;
        if (!cardName) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "card_name is required" }),
          };
          break;
        }

        const cardId = await resolveCardId(cardName);
        if (!cardId) {
          await mysql.end();
          response = {
            statusCode: 200,
            headers: cacheableHeaders,
            body: JSON.stringify({ count: 0, average: null }),
          };
          break;
        }

        const results = await mysql.query(
          `SELECT COUNT(*) as count, AVG(rating) as average
           FROM card_ratings WHERE card_id = ?`,
          [cardId]
        );
        await mysql.end();

        response = {
          statusCode: 200,
          headers: cacheableHeaders,
          body: JSON.stringify({
            count: results[0].count,
            average: results[0].average ? parseFloat(results[0].average.toFixed(2)) : null,
          }),
        };
        break;
      } catch (error) {
        await mysql.end();
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: String(error) }),
        };
        break;
      }

    // POST /ratings — public rate-a-card. Signed-in callers (valid Firebase
    // token) upsert on (user_id, card_id); anonymous callers upsert on
    // (ip_hash, card_id) so one IP gets one vote per card, editable.
    case "POST":
      try {
        const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : (event.body || {});
        const { card_name: cardName, rating } = body;
        const comment = normalizeComment(body.comment);

        if (!cardName || rating === undefined || rating === null) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "card_name and rating are required" }),
          };
          break;
        }

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "rating must be an integer between 1 and 5" }),
          };
          break;
        }

        const cardId = await resolveCardId(cardName);
        if (!cardId) {
          await mysql.end();
          response = {
            statusCode: 404,
            headers: responseHeaders,
            body: JSON.stringify({ error: "Card not found" }),
          };
          break;
        }

        const userId = await getOptionalUserId(event);
        if (userId) {
          await mysql.query(
            `INSERT INTO card_ratings (user_id, card_id, rating, comment)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment), updated_at = NOW()`,
            [userId, cardId, rating, comment]
          );
        } else {
          const ipHash = hashIp(getClientIp(event));
          if (!ipHash) {
            // Without a stable identity we can't enforce one vote per
            // visitor, so reject rather than accept unlimited votes.
            await mysql.end();
            response = {
              statusCode: 400,
              headers: responseHeaders,
              body: JSON.stringify({ error: "Unable to accept rating" }),
            };
            break;
          }
          await mysql.query(
            `INSERT INTO card_ratings (ip_hash, card_id, rating, comment)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment), updated_at = NOW()`,
            [ipHash, cardId, rating, comment]
          );
        }
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ success: true, rating }),
        };
        break;
      } catch (error) {
        await mysql.end();
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: String(error) }),
        };
        break;
      }

    default:
      response = {
        statusCode: 405,
        headers: responseHeaders,
        body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed` }),
      };
      break;
  }

  console.info(`response from: ${event.path} statusCode: ${response.statusCode}`);
  return response;
};

// Authenticated handler for user's own rating
exports.CardRatingsUserHandler = async (event) => {
  console.info("received:", event.httpMethod, event.path);

  let response = {};
  const userId = event.requestContext?.authorizer?.sub;

  switch (event.httpMethod) {
    case "OPTIONS":
      response = {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({ statusText: "OK" }),
      };
      break;

    case "GET":
      try {
        const cardName = event.queryStringParameters?.card_name;
        if (!cardName) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "card_name is required" }),
          };
          break;
        }

        const cardId = await resolveCardId(cardName);
        if (!cardId) {
          await mysql.end();
          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({ rating: null }),
          };
          break;
        }

        const results = await mysql.query(
          `SELECT rating FROM card_ratings WHERE user_id = ? AND card_id = ?`,
          [userId, cardId]
        );
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({
            rating: results.length > 0 ? results[0].rating : null,
          }),
        };
        break;
      } catch (error) {
        await mysql.end();
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: String(error) }),
        };
        break;
      }

    case "POST":
      try {
        const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
        const { card_name: cardName, rating } = body;

        if (!cardName || !rating) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "card_name and rating are required" }),
          };
          break;
        }

        if (rating < 0 || rating > 5 || !Number.isInteger(rating)) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "rating must be an integer between 0 and 5" }),
          };
          break;
        }

        const cardId = await resolveCardId(cardName);
        if (!cardId) {
          await mysql.end();
          response = {
            statusCode: 404,
            headers: responseHeaders,
            body: JSON.stringify({ error: "Card not found" }),
          };
          break;
        }

        // Upsert: insert or update on duplicate key
        await mysql.query(
          `INSERT INTO card_ratings (user_id, card_id, rating)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE rating = VALUES(rating), updated_at = NOW()`,
          [userId, cardId, rating]
        );
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ success: true, rating }),
        };
        break;
      } catch (error) {
        await mysql.end();
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: String(error) }),
        };
        break;
      }

    default:
      response = {
        statusCode: 405,
        headers: responseHeaders,
        body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed` }),
      };
      break;
  }

  console.info(`response from: ${event.path} statusCode: ${response.statusCode}`);
  return response;
};
