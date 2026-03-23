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

exports.CardWireHandler = async (event) => {
  console.info("received:", event);

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
         ORDER BY cw.changed_at DESC
         LIMIT ?`,
        [limit]
      );
    }
    await mysql.end();

    return {
      statusCode: 200,
      headers: responseHeaders,
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
