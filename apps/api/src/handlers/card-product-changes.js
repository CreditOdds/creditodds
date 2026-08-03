// Aggregate the product-change graph around a single card.
//
// Every product change a user logs in their wallet writes a row to
// wallet_card_events (event_type = 'product_change') with the card they came
// from and the card they landed on. Rolled up per card, that gives two flows:
//
//   inbound  — cards people product-changed INTO this card
//   outbound — cards people product-changed this card INTO
//
// GET /card-product-changes?card_id=74[&limit=6] returns both sides with a
// per-edge count and its share of that direction's total, which the card page
// renders as a flow diagram sized by share.
//
// Shares are computed over the direction's FULL total before the top-N slice,
// so a truncated list still reports honest percentages (and `inbound.length <
// inbound_edge_count` tells the client the tail was cut).

const mysql = require("../db");

const responseHeaders = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;

// Both directions in one round trip. INNER JOIN cards on purpose: an edge that
// points at a card no longer in the catalog can't be rendered or linked, so
// dropping it here keeps it out of the totals too. old <> new guards against a
// self-loop, which a malformed client write could otherwise produce.
const EDGE_SQL = `
  SELECT
    'in' AS direction,
    e.old_card_id AS other_card_id,
    c.card_name AS other_card_name,
    c.bank AS other_bank,
    c.card_image_link AS other_card_image_link,
    COUNT(*) AS event_count,
    COUNT(DISTINCT e.user_id) AS user_count,
    SUM(e.reason = 'forced') AS forced_count,
    MAX(e.change_date) AS last_change_date
  FROM wallet_card_events e
  JOIN cards c ON c.card_id = e.old_card_id
  WHERE e.event_type = 'product_change'
    AND e.new_card_id = ?
    AND e.old_card_id <> e.new_card_id
  GROUP BY e.old_card_id, c.card_name, c.bank, c.card_image_link

  UNION ALL

  SELECT
    'out' AS direction,
    e.new_card_id AS other_card_id,
    c.card_name AS other_card_name,
    c.bank AS other_bank,
    c.card_image_link AS other_card_image_link,
    COUNT(*) AS event_count,
    COUNT(DISTINCT e.user_id) AS user_count,
    SUM(e.reason = 'forced') AS forced_count,
    MAX(e.change_date) AS last_change_date
  FROM wallet_card_events e
  JOIN cards c ON c.card_id = e.new_card_id
  WHERE e.event_type = 'product_change'
    AND e.old_card_id = ?
    AND e.old_card_id <> e.new_card_id
  GROUP BY e.new_card_id, c.card_name, c.bank, c.card_image_link
`;

function toEdge(row, directionTotal) {
  const count = Number(row.event_count);
  return {
    card_id: Number(row.other_card_id),
    card_name: row.other_card_name,
    bank: row.other_bank,
    card_image_link: row.other_card_image_link || null,
    count,
    // Distinct wallets behind the count. Equal to `count` except when one
    // person logged the same change on two copies of the card.
    users: Number(row.user_count),
    // 'forced' means the issuer moved the cardholder rather than the
    // cardholder choosing to. Worth surfacing: a mostly-forced outbound edge
    // reads very differently from a mostly-voluntary one.
    forced: Number(row.forced_count || 0),
    share: directionTotal > 0 ? Math.round((count / directionTotal) * 1000) / 10 : 0,
    last_change_date: row.last_change_date
      ? new Date(row.last_change_date).toISOString().slice(0, 10)
      : null,
  };
}

exports.CardProductChangesHandler = async (event) => {
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
        const cardId = parseInt(event.queryStringParameters?.card_id, 10);
        if (!Number.isInteger(cardId) || cardId <= 0) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "card_id query parameter required (numeric card id)" }),
          };
          break;
        }

        const limitRaw = parseInt(event.queryStringParameters?.limit, 10);
        const limit = Number.isFinite(limitRaw)
          ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT)
          : DEFAULT_LIMIT;

        const rows = await mysql.query(EDGE_SQL, [cardId, cardId]);
        await mysql.end();

        const inRows = rows.filter((r) => r.direction === "in");
        const outRows = rows.filter((r) => r.direction === "out");

        const sumCounts = (rs) => rs.reduce((acc, r) => acc + Number(r.event_count), 0);
        const inboundTotal = sumCounts(inRows);
        const outboundTotal = sumCounts(outRows);

        const rank = (rs, total) =>
          rs
            .map((r) => toEdge(r, total))
            .sort((a, b) => b.count - a.count || a.card_name.localeCompare(b.card_name))
            .slice(0, limit);

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({
            card_id: cardId,
            inbound: rank(inRows, inboundTotal),
            outbound: rank(outRows, outboundTotal),
            inbound_total: inboundTotal,
            outbound_total: outboundTotal,
            // Distinct source/destination cards before the top-N slice, so the
            // client can tell whether it is showing the whole picture.
            inbound_edge_count: inRows.length,
            outbound_edge_count: outRows.length,
          }),
        };
      } catch (error) {
        console.error("Error fetching card product changes:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: "Failed to fetch product changes" }),
        };
      }
      break;

    default:
      response = {
        statusCode: 405,
        headers: responseHeaders,
        body: `CardProductChanges only accepts GET, OPTIONS — you tried: ${event.httpMethod}`,
      };
      break;
  }

  console.info(`response from: ${event.path} statusCode: ${response.statusCode}`);
  return response;
};
