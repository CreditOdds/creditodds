const mysql = require("../db");

const responseHeaders = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};


// Cacheable headers for public GET reads: lets CloudFront/browser cache
// successful responses (s-maxage matches the 300s ISR/stats cadence). Applied
// only to 200 reads, never to errors or authenticated/POST responses.
const cacheableHeaders = {
  ...responseHeaders,
  "Cache-Control": "public, max-age=60, s-maxage=300",
};

exports.CardWireHandler = async (event) => {
  console.info("received:", event.httpMethod, event.path);

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ statusText: "OK" }),
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: responseHeaders,
      body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed` }),
    };
  }

  try {
    const cardId = event.queryStringParameters?.card_id;
    const limit = Math.min(
      parseInt(event.queryStringParameters?.limit || "50", 10),
      200
    );

    let rows;
    if (cardId) {
      rows = await mysql.query(
        `SELECT cw.id, cw.card_id, c.card_name, cw.field,
                cw.old_value, cw.new_value, cw.changed_at
         FROM card_wire cw
         JOIN cards c ON c.card_id = cw.card_id
         WHERE cw.card_id = ?
           AND cw.field != 'reward_top_rate'
         ORDER BY cw.changed_at DESC
         LIMIT ?`,
        [parseInt(cardId, 10), limit]
      );
    } else {
      rows = await mysql.query(
        `SELECT cw.id, cw.card_id, c.card_name, c.card_image_link,
                cw.field, cw.old_value, cw.new_value, cw.changed_at
         FROM card_wire cw
         JOIN cards c ON c.card_id = cw.card_id
         WHERE cw.field != 'reward_top_rate'
         ORDER BY cw.changed_at DESC
         LIMIT ?`,
        [limit]
      );
    }
    await mysql.end();

    return {
      statusCode: 200,
      headers: cacheableHeaders,
      body: JSON.stringify({ changes: rows }),
    };
  } catch (error) {
    console.error("Error fetching card wire:", error);
    await mysql.end();
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: "Failed to fetch card wire" }),
    };
  }
};
