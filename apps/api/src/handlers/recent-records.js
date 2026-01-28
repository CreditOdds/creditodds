// Returns the most recent approved records for the ticker
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
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.RecentRecordsHandler = async (event) => {
  console.info("received:", event);

  let response = {};

  try {
    // Get the 5 most recent approved records with card info
    let results = await mysql.query(
      `SELECT
        r.record_id,
        r.result,
        r.credit_score,
        r.listed_income,
        r.submit_datetime,
        c.card_name,
        c.card_image_link,
        c.bank
      FROM records r
      JOIN cards c ON r.card_id = c.card_id
      WHERE r.admin_review = 1 AND r.active = 1
      ORDER BY r.submit_datetime DESC
      LIMIT 5`
    );
    await mysql.end();

    results = JSON.parse(JSON.stringify(results));

    response = {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify(results),
    };
  } catch (error) {
    console.error("Error fetching recent records:", error);
    response = {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: "Failed to fetch recent records" }),
    };
  }

  return response;
};
