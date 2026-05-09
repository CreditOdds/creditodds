// User Card Selections API — manage per-wallet-card category picks for cards
// like U.S. Bank Cash+ (user_choice quarterly) and Citi Custom Cash
// (auto_top_spend monthly). Each wallet card can have multiple active
// selections (Cash+ has two 5% picks). History is preserved by setting
// valid_to instead of deleting; the BCH ranker reads only rows where
// valid_to IS NULL.
//
// Routes:
//   GET    /wallet/{id}/selections   — list active selections + auto_renew
//   PUT    /wallet/{id}/selections   — replace all active selections
//   DELETE /wallet/{id}/selections   — clear (expire all active rows)
const mysql = require("../db");

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,PUT,DELETE,OPTIONS",
};

function bad(status, message) {
  return {
    statusCode: status,
    headers: responseHeaders,
    body: JSON.stringify({ error: message }),
  };
}

function ok(body, status = 200) {
  return {
    statusCode: status,
    headers: responseHeaders,
    body: JSON.stringify(body),
  };
}

exports.UserCardSelectionsHandler = async (event) => {
  console.info("received:", event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: responseHeaders, body: "" };
  }

  const userId = event.requestContext?.authorizer?.principalId;
  if (!userId) return bad(401, "Unauthorized");

  const walletRowId = event.pathParameters?.id ? Number(event.pathParameters.id) : null;
  if (!walletRowId || !Number.isFinite(walletRowId)) {
    return bad(400, "wallet row id is required in path");
  }

  try {
    const owns = await mysql.query(
      "SELECT id FROM user_cards WHERE id = ? AND user_id = ?",
      [walletRowId, userId]
    );
    if (owns.length === 0) {
      await mysql.end();
      return bad(404, "Wallet card not found");
    }

    switch (event.httpMethod) {
      case "GET": {
        const rows = await mysql.query(
          `SELECT id, reward_category, reward_rate, selected_category,
                  valid_from, valid_to, source, auto_renew, created_at
           FROM user_card_selections
           WHERE user_card_id = ? AND valid_to IS NULL
           ORDER BY reward_category, reward_rate DESC, id ASC`,
          [walletRowId]
        );
        await mysql.end();
        return ok({
          selections: rows.map((r) => ({
            reward_category: r.reward_category,
            reward_rate: Number(r.reward_rate),
            selected_category: r.selected_category,
            valid_from: r.valid_from,
            source: r.source,
            auto_renew: Boolean(r.auto_renew),
          })),
        });
      }

      case "PUT": {
        const body = JSON.parse(event.body || "{}");
        const selections = Array.isArray(body.selections) ? body.selections : null;
        const autoRenew = Boolean(body.auto_renew);

        if (!selections) {
          await mysql.end();
          return bad(400, "selections array is required");
        }

        for (const s of selections) {
          if (
            !s ||
            typeof s.reward_category !== "string" ||
            typeof s.selected_category !== "string" ||
            typeof s.reward_rate !== "number" ||
            !s.reward_category.match(/^[a-z0-9_]+$/i) ||
            !s.selected_category.match(/^[a-z0-9_]+$/i)
          ) {
            await mysql.end();
            return bad(400, "each selection needs reward_category (slug), reward_rate (number), selected_category (slug)");
          }
        }

        // Expire all active selections for this wallet card, then insert the new set.
        // Two statements; if the insert fails the expiry persists, leaving the card
        // unconfigured — same state as DELETE — which is acceptable and recoverable.
        await mysql.query(
          `UPDATE user_card_selections
           SET valid_to = CURRENT_TIMESTAMP
           WHERE user_card_id = ? AND valid_to IS NULL`,
          [walletRowId]
        );

        if (selections.length > 0) {
          const values = selections.map(() => "(?, ?, ?, ?, 'user_pick', ?)").join(", ");
          const params = [];
          for (const s of selections) {
            params.push(walletRowId, s.reward_category, s.reward_rate, s.selected_category, autoRenew ? 1 : 0);
          }
          await mysql.query(
            `INSERT INTO user_card_selections
              (user_card_id, reward_category, reward_rate, selected_category, source, auto_renew)
             VALUES ${values}`,
            params
          );
        }

        await mysql.end();
        return ok({ message: "Selections updated", count: selections.length, auto_renew: autoRenew });
      }

      case "DELETE": {
        await mysql.query(
          `UPDATE user_card_selections
           SET valid_to = CURRENT_TIMESTAMP
           WHERE user_card_id = ? AND valid_to IS NULL`,
          [walletRowId]
        );
        await mysql.end();
        return ok({ message: "Selections cleared" });
      }

      default:
        await mysql.end();
        return bad(405, `Method ${event.httpMethod} not allowed`);
    }
  } catch (error) {
    console.error("Error:", error);
    try { await mysql.end(); } catch (_) { /* ignore */ }
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: "Internal server error", details: error.message }),
    };
  }
};
