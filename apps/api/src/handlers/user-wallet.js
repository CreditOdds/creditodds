// User Wallet API - Manage cards in user's wallet
//
// Routes:
//   GET    /wallet         — list every card instance in the user's wallet
//   POST   /wallet         — add a new instance (duplicates of the same card_id are allowed)
//   PUT    /wallet/{id}    — update acquired_month / acquired_year on a specific instance
//   DELETE /wallet/{id}    — remove a specific instance
//
// Per-card identity is `user_cards.id` (auto-increment). Ratings live in `card_ratings`
// keyed by (user_id, card_id) — one rating per card type, shared across duplicates.
const mysql = require("../db");

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

function validateAcquiredDate(acquired_month, acquired_year) {
  if (acquired_month !== undefined && acquired_month !== null) {
    if (acquired_month < 1 || acquired_month > 12) {
      return "acquired_month must be between 1 and 12";
    }
  }
  if (acquired_year !== undefined && acquired_year !== null) {
    const currentYear = new Date().getFullYear();
    if (acquired_year < 1950 || acquired_year > currentYear) {
      return `acquired_year must be between 1950 and ${currentYear}`;
    }
  }
  return null;
}

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

  const walletRowId = event.pathParameters?.id ? Number(event.pathParameters.id) : null;
  let response = {};

  try {
    switch (event.httpMethod) {
      case "GET": {
        // Get all card instances in the user's wallet, with the shared
        // (per-card-type) rating preloaded so the edit modal doesn't flash empty stars.
        const walletCards = await mysql.query(`
          SELECT
            uc.id,
            uc.card_id,
            uc.acquired_month,
            uc.acquired_year,
            uc.created_at,
            c.card_name,
            c.bank,
            c.card_image_link,
            cr.rating AS user_rating
          FROM user_cards uc
          JOIN cards c ON uc.card_id = c.card_id
          LEFT JOIN card_ratings cr
            ON cr.card_id = uc.card_id AND cr.user_id = uc.user_id
          WHERE uc.user_id = ?
          ORDER BY uc.created_at ASC, uc.id ASC
        `, [userId]);

        // Active category selections for these wallet rows (Cash+, Custom Cash, etc).
        // Joined into the wallet response so the BCH ranker has everything it needs
        // in one round-trip. Wrapped in try/catch so a missing table (e.g. between
        // a backend deploy and migration 029 running) doesn't break GET /wallet —
        // we just degrade to empty selections.
        const walletRowIds = walletCards.map((w) => w.id);
        const selectionsByWalletId = new Map();
        if (walletRowIds.length > 0) {
          try {
            const selectionRows = await mysql.query(
              `SELECT user_card_id, reward_category, reward_rate, selected_category, auto_renew
               FROM user_card_selections
               WHERE user_card_id IN (?) AND valid_to IS NULL`,
              [walletRowIds]
            );
            for (const r of selectionRows) {
              const list = selectionsByWalletId.get(r.user_card_id) || [];
              list.push({
                reward_category: r.reward_category,
                reward_rate: Number(r.reward_rate),
                selected_category: r.selected_category,
                auto_renew: Boolean(r.auto_renew),
              });
              selectionsByWalletId.set(r.user_card_id, list);
            }
          } catch (selErr) {
            console.error("user_card_selections lookup failed (continuing with empty selections):", selErr.message);
          }
        }
        const enriched = walletCards.map((w) => ({
          ...w,
          selections: selectionsByWalletId.get(w.id) || [],
        }));
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify(enriched),
        };
        break;
      }

      case "POST": {
        // Add a new card instance to the wallet. Duplicates of the same card_id are allowed —
        // each row has its own auto-increment `id`.
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

        const dateError = validateAcquiredDate(acquired_month, acquired_year);
        if (dateError) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: dateError }),
          };
          break;
        }

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

        const insertResult = await mysql.query(`
          INSERT INTO user_cards (user_id, card_id, acquired_month, acquired_year)
          VALUES (?, ?, ?, ?)
        `, [userId, card_id, acquired_month || null, acquired_year || null]);
        await mysql.end();

        response = {
          statusCode: 201,
          headers: responseHeaders,
          body: JSON.stringify({
            message: "Card added to wallet",
            id: insertResult.insertId,
            card_id,
            acquired_month: acquired_month || null,
            acquired_year: acquired_year || null,
          }),
        };
        break;
      }

      case "PUT": {
        // Update acquired_month / acquired_year on a specific wallet row.
        if (!walletRowId || !Number.isFinite(walletRowId)) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "wallet row id is required in path" }),
          };
          break;
        }

        const editBody = JSON.parse(event.body || "{}");
        const { acquired_month, acquired_year } = editBody;

        const dateError = validateAcquiredDate(acquired_month, acquired_year);
        if (dateError) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: dateError }),
          };
          break;
        }

        const updateResult = await mysql.query(`
          UPDATE user_cards
          SET acquired_month = ?, acquired_year = ?
          WHERE id = ? AND user_id = ?
        `, [acquired_month || null, acquired_year || null, walletRowId, userId]);
        await mysql.end();

        if (updateResult.affectedRows === 0) {
          response = {
            statusCode: 404,
            headers: responseHeaders,
            body: JSON.stringify({ error: "Wallet card not found" }),
          };
        } else {
          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({
              message: "Wallet card updated",
              id: walletRowId,
              acquired_month: acquired_month || null,
              acquired_year: acquired_year || null,
            }),
          };
        }
        break;
      }

      case "DELETE": {
        // Remove a specific wallet row. Always keyed by row id so duplicates of
        // the same card_id can be removed independently.
        if (!walletRowId || !Number.isFinite(walletRowId)) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "wallet row id is required in path" }),
          };
          break;
        }

        const deleteResult = await mysql.query(
          "DELETE FROM user_cards WHERE id = ? AND user_id = ?",
          [walletRowId, userId]
        );
        await mysql.end();

        if (deleteResult.affectedRows === 0) {
          response = {
            statusCode: 404,
            headers: responseHeaders,
            body: JSON.stringify({ error: "Wallet card not found" }),
          };
        } else {
          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({ message: "Card removed from wallet" }),
          };
        }
        break;
      }

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
