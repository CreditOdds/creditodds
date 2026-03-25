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

// Resolve a card_name to its numeric card_id
async function resolveCardId(cardName) {
  const rows = await mysql.query(
    `SELECT card_id FROM cards WHERE card_name = ? OR card_name = ? LIMIT 1`,
    [cardName, cardName.replace(/ Card$/, '')]
  );
  return rows.length > 0 ? rows[0].card_id : null;
}

// GET /ratings?card_name=Chase+Sapphire+Preferred — public, returns avg + count
exports.CardRatingsHandler = async (event) => {
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
          headers: responseHeaders,
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
  console.info("received:", event);

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
