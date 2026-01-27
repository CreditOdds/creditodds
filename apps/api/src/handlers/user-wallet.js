// User Wallet API - Manage cards in user's wallet
const mysql = require("serverless-mysql")({
  config: {
    host: process.env.ENDPOINT,
    database: process.env.DATABASE,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
  },
});

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
};

exports.UserWalletHandler = async (event) => {
  console.info("received:", event);

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: "",
    };
  }

  // Get user ID from authorizer context (set by Firebase authorizer)
  const userId = event.requestContext?.authorizer?.principalId;
  if (!userId) {
    return {
      statusCode: 401,
      headers: responseHeaders,
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  let response = {};

  try {
    switch (event.httpMethod) {
      case "GET":
        // Get all cards in user's wallet with card details
        const walletCards = await mysql.query(`
          SELECT
            uc.id,
            uc.card_id,
            uc.acquired_month,
            uc.acquired_year,
            uc.created_at,
            c.card_name,
            c.bank,
            c.card_image_link
          FROM user_cards uc
          JOIN cards c ON uc.card_id = c.card_id
          WHERE uc.user_id = ?
          ORDER BY uc.created_at DESC
        `, [userId]);
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify(walletCards),
        };
        break;

      case "POST":
        // Add card to wallet
        const addBody = JSON.parse(event.body || "{}");
        const { card_id, acquired_month, acquired_year } = addBody;

        if (!card_id) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "card_id is required" }),
          };
          break;
        }

        // Validate month if provided
        if (acquired_month !== undefined && acquired_month !== null) {
          if (acquired_month < 1 || acquired_month > 12) {
            response = {
              statusCode: 400,
              headers: responseHeaders,
              body: JSON.stringify({ error: "acquired_month must be between 1 and 12" }),
            };
            break;
          }
        }

        // Validate year if provided
        if (acquired_year !== undefined && acquired_year !== null) {
          const currentYear = new Date().getFullYear();
          if (acquired_year < 1950 || acquired_year > currentYear) {
            response = {
              statusCode: 400,
              headers: responseHeaders,
              body: JSON.stringify({ error: `acquired_year must be between 1950 and ${currentYear}` }),
            };
            break;
          }
        }

        // Check if card exists
        const cardExists = await mysql.query(
          "SELECT card_id FROM cards WHERE card_id = ?",
          [card_id]
        );
        if (cardExists.length === 0) {
          await mysql.end();
          response = {
            statusCode: 404,
            headers: responseHeaders,
            body: JSON.stringify({ error: "Card not found" }),
          };
          break;
        }

        // Insert or update (upsert) - if card already in wallet, update acquired date
        await mysql.query(`
          INSERT INTO user_cards (user_id, card_id, acquired_month, acquired_year)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            acquired_month = VALUES(acquired_month),
            acquired_year = VALUES(acquired_year)
        `, [userId, card_id, acquired_month || null, acquired_year || null]);
        await mysql.end();

        response = {
          statusCode: 201,
          headers: responseHeaders,
          body: JSON.stringify({
            message: "Card added to wallet",
            card_id,
            acquired_month: acquired_month || null,
            acquired_year: acquired_year || null
          }),
        };
        break;

      case "DELETE":
        // Remove card from wallet
        const deleteBody = JSON.parse(event.body || "{}");
        const cardIdToDelete = deleteBody.card_id;

        if (!cardIdToDelete) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "card_id is required" }),
          };
          break;
        }

        const deleteResult = await mysql.query(
          "DELETE FROM user_cards WHERE user_id = ? AND card_id = ?",
          [userId, cardIdToDelete]
        );
        await mysql.end();

        if (deleteResult.affectedRows === 0) {
          response = {
            statusCode: 404,
            headers: responseHeaders,
            body: JSON.stringify({ error: "Card not found in wallet" }),
          };
        } else {
          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({ message: "Card removed from wallet" }),
          };
        }
        break;

      default:
        response = {
          statusCode: 405,
          headers: responseHeaders,
          body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed` }),
        };
    }
  } catch (error) {
    console.error("Error:", error);
    await mysql.end();
    response = {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: "Internal server error", details: error.message }),
    };
  }

  console.info(`response from: ${event.path} statusCode: ${response.statusCode}`);
  return response;
};
