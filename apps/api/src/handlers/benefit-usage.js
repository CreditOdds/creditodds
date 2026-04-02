// Benefit Usage API - Track which card benefits users have redeemed per period
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

exports.BenefitUsageHandler = async (event) => {
  console.info("BenefitUsage received:", event);

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ statusText: "OK" }),
    };
  }

  const userId = event.requestContext?.authorizer?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers: responseHeaders,
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  let response;

  switch (event.httpMethod) {
    case "GET":
      try {
        const year = event.queryStringParameters?.year || new Date().getFullYear();
        const results = await mysql.query(
          `SELECT * FROM benefit_usage
           WHERE user_id = ?
             AND (YEAR(period_start) = ? OR period_start = '1970-01-01')
           ORDER BY period_start`,
          [userId, year]
        );
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ usages: results }),
        };
      } catch (error) {
        console.error("Error fetching benefit usage:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: `Failed to fetch benefit usage: ${error.message}` }),
        };
      }
      break;

    case "POST":
      try {
        const body = JSON.parse(event.body);
        const { card_id, benefit_name, frequency, period_start, status } = body;

        if (!card_id || !benefit_name || !frequency || !period_start) {
          return {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "card_id, benefit_name, frequency, and period_start are required" }),
          };
        }

        const validFrequencies = ['monthly', 'quarterly', 'semi_annual', 'annual', 'multi_year'];
        if (!validFrequencies.includes(frequency)) {
          return {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: `Invalid frequency. Must be one of: ${validFrequencies.join(', ')}` }),
          };
        }

        const validStatuses = ['used', 'dismissed'];
        const finalStatus = status && validStatuses.includes(status) ? status : 'used';

        await mysql.query(
          `INSERT INTO benefit_usage (user_id, card_id, benefit_name, frequency, period_start, status)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE status = VALUES(status), updated_at = CURRENT_TIMESTAMP`,
          [userId, card_id, benefit_name, frequency, period_start, finalStatus]
        );
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ message: "Benefit usage updated" }),
        };
      } catch (error) {
        console.error("Error toggling benefit usage:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: `Failed to update benefit usage: ${error.message}` }),
        };
      }
      break;

    case "DELETE":
      try {
        const body = JSON.parse(event.body);
        const { card_id, benefit_name, period_start } = body;

        if (!card_id || !benefit_name || !period_start) {
          return {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "card_id, benefit_name, and period_start are required" }),
          };
        }

        await mysql.query(
          `DELETE FROM benefit_usage
           WHERE user_id = ? AND card_id = ? AND benefit_name = ? AND period_start = ?`,
          [userId, card_id, benefit_name, period_start]
        );
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ message: "Benefit usage removed" }),
        };
      } catch (error) {
        console.error("Error removing benefit usage:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: `Failed to remove benefit usage: ${error.message}` }),
        };
      }
      break;

    default:
      response = {
        statusCode: 405,
        headers: responseHeaders,
        body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed` }),
      };
      break;
  }

  return response;
};
