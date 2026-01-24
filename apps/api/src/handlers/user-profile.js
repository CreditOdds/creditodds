// Create clients and set shared const values outside of the handler.
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

exports.UserProfileHandler = async (event) => {
  // All log statements are written to CloudWatch
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
    case "GET":
      try {
        const userId = event.requestContext.authorizer.sub;
        const claims = event.requestContext.authorizer;

        // Get counts from database
        const [recordsResult, referralsResult] = await Promise.all([
          mysql.query("SELECT COUNT(*) as count FROM records WHERE submitter_id = ?", [userId]),
          mysql.query("SELECT COUNT(*) as count FROM referrals WHERE submitter_id = ?", [userId])
        ]);
        await mysql.end();

        const recordsCount = recordsResult[0]?.count || 0;
        const referralsCount = referralsResult[0]?.count || 0;

        // Build profile response from Firebase authorizer context
        const profile = {
          username: claims['cognito:username'] || claims.preferred_username || claims.email?.split('@')[0] || 'User',
          email: claims.email || '',
          records_count: recordsCount,
          referrals_count: referralsCount,
        };

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify(profile),
        };
        break;
      } catch (error) {
        console.error("Profile error:", error);
        response = {
          statusCode: 500,
          body: `Error: ${error}`,
          headers: responseHeaders,
        };
        break;
      }
    default:
      response = {
        statusCode: 405,
        body: `UserProfile only accepts GET method, you tried: ${event.httpMethod}`,
        headers: responseHeaders,
      };
      break;
  }
  // All log statements are written to CloudWatch
  console.info(
    `response from: ${event.path} statusCode: ${response.statusCode} body: ${response.body}`
  );
  return response;
};
