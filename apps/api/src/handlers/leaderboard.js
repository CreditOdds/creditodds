// Leaderboard handler - returns top contributors by data points submitted
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

exports.LeaderboardHandler = async (event) => {
  console.info("Leaderboard received:", event);

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
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const limit = Math.min(parseInt(event.queryStringParameters?.limit) || 25, 100);

    // Get top contributors by records submitted
    // Only count users with submitter_id (not anonymous/deleted users)
    // Use first 4 chars of submitter_id as anonymous display name
    const topContributors = await mysql.query(`
      SELECT
        CONCAT('User_', LEFT(submitter_id, 4)) as display_name,
        COUNT(*) as records_count,
        SUM(CASE WHEN result = 1 THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN result = 0 THEN 1 ELSE 0 END) as denied_count,
        MIN(submit_datetime) as first_submission,
        MAX(submit_datetime) as last_submission
      FROM records
      WHERE submitter_id IS NOT NULL
      GROUP BY submitter_id
      HAVING COUNT(*) >= 1
      ORDER BY records_count DESC
      LIMIT ?
    `, [limit]);

    // Get total stats
    const [totalStats] = await mysql.query(`
      SELECT
        COUNT(*) as total_records,
        COUNT(DISTINCT submitter_id) as total_contributors,
        SUM(CASE WHEN result = 1 THEN 1 ELSE 0 END) as total_approved,
        SUM(CASE WHEN result = 0 THEN 1 ELSE 0 END) as total_denied
      FROM records
      WHERE submitter_id IS NOT NULL
    `);

    await mysql.end();

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        leaderboard: topContributors,
        stats: {
          total_records: totalStats.total_records || 0,
          total_contributors: totalStats.total_contributors || 0,
          total_approved: totalStats.total_approved || 0,
          total_denied: totalStats.total_denied || 0,
        }
      }),
    };
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: `Failed to fetch leaderboard: ${error.message}` }),
    };
  }
};
