// User Wallet API - Manage cards in user's wallet
//
// Routes:
//   GET    /wallet                          — list every card instance in the user's wallet
//   POST   /wallet                          — add a new instance (duplicates of the same card_id are allowed)
//   PUT    /wallet/reorder                  — set sort_order for a list of wallet rows (drag-to-reorder)
//   GET    /wallet/events                   — list product-change events for the user
//   PUT    /wallet/{id}                     — update acquired_month / acquired_year on a specific instance
//   DELETE /wallet/{id}                     — remove a specific instance
//   POST   /wallet/{id}/product-change      — convert a wallet row from one card to another (same issuer); logs the event
//
// Per-card identity is `user_cards.id` (auto-increment). Ratings live in `card_ratings`
// keyed by (user_id, card_id) — one rating per card type, shared across duplicates.
// Product changes preserve the wallet row id and acquired_month/year (same account,
// different product) and append a row to `wallet_card_events`.
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
  console.info("received:", event.httpMethod, event.path);

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
  const routeKey = event.resource || event.path || "";
  const isReorderRoute = routeKey.endsWith("/wallet/reorder");
  const isEventsRoute = routeKey.endsWith("/wallet/events");
  const isProductChangeRoute = routeKey.endsWith("/wallet/{id}/product-change") || routeKey.endsWith("/product-change");
  let response = {};

  try {
    switch (event.httpMethod) {
      case "GET": {
        if (isEventsRoute) {
          // Product-change history for the user. Joins both old and new card
          // names so the frontend can render "Sapphire Preferred → Sapphire
          // Reserve" without a second lookup. Newest event first.
          const events = await mysql.query(`
            SELECT
              e.id,
              e.user_card_id,
              e.event_type,
              e.old_card_id,
              e.new_card_id,
              e.change_date,
              e.reason,
              e.note,
              e.created_at,
              co.card_name AS old_card_name,
              co.card_image_link AS old_card_image_link,
              cn.card_name AS new_card_name,
              cn.card_image_link AS new_card_image_link,
              cn.bank AS bank
            FROM wallet_card_events e
            LEFT JOIN cards co ON e.old_card_id = co.card_id
            LEFT JOIN cards cn ON e.new_card_id = cn.card_id
            WHERE e.user_id = ?
            ORDER BY e.change_date DESC, e.id DESC
          `, [userId]);
          await mysql.end();

          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify(events),
          };
          break;
        }

        // Get all card instances in the user's wallet, with the shared
        // (per-card-type) rating preloaded so the edit modal doesn't flash empty stars.
        // Rows the user has explicitly reordered (sort_order set) come first; the rest
        // fall back to insertion order so older accounts keep their existing layout.
        // sort_order is wrapped in COALESCE so a missing column (pre-migration deploy)
        // would surface as a clear error rather than silently mis-ordering — the
        // SELECT below also references uc.sort_order so the dependency is explicit.
        const walletCards = await mysql.query(`
          SELECT
            uc.id,
            uc.card_id,
            uc.acquired_month,
            uc.acquired_year,
            uc.sort_order,
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
          ORDER BY (uc.sort_order IS NULL), uc.sort_order ASC, uc.created_at ASC, uc.id ASC
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
        if (isProductChangeRoute) {
          // Product change: same account, different card. Preserve the wallet
          // row id, user_id, acquired_month, acquired_year, sort_order — only
          // the linked card_id changes. Issuer (cards.bank) must match.
          if (!walletRowId || !Number.isFinite(walletRowId)) {
            response = {
              statusCode: 400,
              headers: responseHeaders,
              body: JSON.stringify({ error: "wallet row id is required in path" }),
            };
            break;
          }

          const body = JSON.parse(event.body || "{}");
          const { new_card_id, change_date, reason, note } = body;

          if (!new_card_id || !Number.isFinite(Number(new_card_id))) {
            response = {
              statusCode: 400,
              headers: responseHeaders,
              body: JSON.stringify({ error: "new_card_id is required" }),
            };
            break;
          }

          if (reason && reason !== "voluntary" && reason !== "forced") {
            response = {
              statusCode: 400,
              headers: responseHeaders,
              body: JSON.stringify({ error: "reason must be 'voluntary' or 'forced'" }),
            };
            break;
          }

          if (note && typeof note === "string" && note.length > 500) {
            response = {
              statusCode: 400,
              headers: responseHeaders,
              body: JSON.stringify({ error: "note must be 500 characters or fewer" }),
            };
            break;
          }

          // Default change_date to today; validate YYYY-MM-DD when provided.
          let effectiveDate = change_date;
          if (effectiveDate) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
              response = {
                statusCode: 400,
                headers: responseHeaders,
                body: JSON.stringify({ error: "change_date must be YYYY-MM-DD" }),
              };
              break;
            }
          } else {
            effectiveDate = new Date().toISOString().slice(0, 10);
          }

          // Load the wallet row + its current card's bank in one query so we
          // can validate ownership and issuer match together.
          const walletRow = await mysql.query(`
            SELECT uc.id, uc.card_id, c.bank
            FROM user_cards uc
            JOIN cards c ON uc.card_id = c.card_id
            WHERE uc.id = ? AND uc.user_id = ?
          `, [walletRowId, userId]);

          if (walletRow.length === 0) {
            await mysql.end();
            response = {
              statusCode: 404,
              headers: responseHeaders,
              body: JSON.stringify({ error: "Wallet card not found" }),
            };
            break;
          }

          const oldCardId = walletRow[0].card_id;
          const oldBank = walletRow[0].bank;

          if (Number(new_card_id) === Number(oldCardId)) {
            await mysql.end();
            response = {
              statusCode: 400,
              headers: responseHeaders,
              body: JSON.stringify({ error: "new_card_id must differ from the current card" }),
            };
            break;
          }

          const newCard = await mysql.query(
            "SELECT card_id, bank FROM cards WHERE card_id = ?",
            [new_card_id]
          );
          if (newCard.length === 0) {
            await mysql.end();
            response = {
              statusCode: 404,
              headers: responseHeaders,
              body: JSON.stringify({ error: "Target card not found" }),
            };
            break;
          }

          if (newCard[0].bank !== oldBank) {
            await mysql.end();
            response = {
              statusCode: 400,
              headers: responseHeaders,
              body: JSON.stringify({
                error: `Product changes are only allowed between cards from the same issuer (current: ${oldBank}, target: ${newCard[0].bank})`,
              }),
            };
            break;
          }

          // Update the wallet row's card_id, then log the event. Two statements
          // (no transactions in the serverless-mysql wrapper); the event log is
          // a record-keeping concern, so order matters less than atomicity.
          await mysql.query(
            "UPDATE user_cards SET card_id = ? WHERE id = ? AND user_id = ?",
            [new_card_id, walletRowId, userId]
          );

          const insertResult = await mysql.query(`
            INSERT INTO wallet_card_events
              (user_id, user_card_id, event_type, old_card_id, new_card_id, change_date, reason, note)
            VALUES (?, ?, 'product_change', ?, ?, ?, ?, ?)
          `, [userId, walletRowId, oldCardId, new_card_id, effectiveDate, reason || null, note || null]);

          await mysql.end();

          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({
              message: "Product change recorded",
              event_id: insertResult.insertId,
              wallet_card_id: walletRowId,
              old_card_id: oldCardId,
              new_card_id: Number(new_card_id),
              change_date: effectiveDate,
            }),
          };
          break;
        }

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
        // Drag-to-reorder: client sends an ordered array of wallet row ids.
        // We persist the index as `sort_order`. Only ids belonging to this
        // user are touched (the WHERE user_id = ? guards against tampering).
        if (isReorderRoute) {
          const reorderBody = JSON.parse(event.body || "{}");
          const order = Array.isArray(reorderBody.order) ? reorderBody.order : null;
          if (!order || order.length === 0) {
            response = {
              statusCode: 400,
              headers: responseHeaders,
              body: JSON.stringify({ error: "order must be a non-empty array of wallet row ids" }),
            };
            break;
          }
          const ids = order.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
          if (ids.length !== order.length) {
            response = {
              statusCode: 400,
              headers: responseHeaders,
              body: JSON.stringify({ error: "order must contain only positive integer wallet row ids" }),
            };
            break;
          }
          // One UPDATE per row — the per-user wallet is small (typically <50 rows),
          // so the round-trip cost is fine and the SQL stays trivial. The
          // user_id guard ensures a malicious client can't reorder someone else's rows.
          for (let i = 0; i < ids.length; i += 1) {
            await mysql.query(
              "UPDATE user_cards SET sort_order = ? WHERE id = ? AND user_id = ?",
              [i, ids[i], userId]
            );
          }
          await mysql.end();
          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({ message: "Wallet reordered", count: ids.length }),
          };
          break;
        }

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
