// Track referral impressions and clicks
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

exports.ReferralStatsHandler = async (event) => {
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

    case "POST":
      try {
        const body = JSON.parse(event.body);
        const { referral_id, event_type } = body;

        if (!referral_id || !event_type) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "referral_id and event_type are required" }),
          };
          break;
        }

        if (!['impression', 'click'].includes(event_type)) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "event_type must be 'impression' or 'click'" }),
          };
          break;
        }

        // Get IP and user agent from request
        const ipAddress = event.requestContext?.identity?.sourceIp || null;
        const userAgent = event.headers?.['User-Agent'] || event.headers?.['user-agent'] || null;

        await mysql.query(
          "INSERT INTO referral_stats (referral_id, event_type, ip_address, user_agent) VALUES (?, ?, ?, ?)",
          [referral_id, event_type, ipAddress, userAgent ? userAgent.substring(0, 500) : null]
        );
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ success: true }),
        };
      } catch (error) {
        console.error("Error tracking referral stat:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: "Failed to track event" }),
        };
      }
      break;

    default:
      response = {
        statusCode: 405,
        headers: responseHeaders,
        body: `ReferralStats only accepts POST method, you tried: ${event.httpMethod}`,
      };
      break;
  }

  console.info(`response from: ${event.path} statusCode: ${response.statusCode}`);
  return response;
};
