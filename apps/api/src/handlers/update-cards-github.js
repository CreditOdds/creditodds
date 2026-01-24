// Create clients and set shared const values outside of the handler.

// Get the DynamoDB table name from environment variables
const mysql = require("serverless-mysql")({
  config: {
    host: process.env.ENDPOINT,
    database: process.env.DATABASE,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
  },
});

/**
 * A simple example includes a HTTP get method to get one item by id from a DynamoDB table.
 */
exports.updateCardsGitHubHandler = async (event) => {
  // All log statements are written to CloudWatch
  console.info("received:", event);

  if (event.action == "closed" && event.pull_request.merged == true) {
    console.log("Pull Request Merged");
  }

  const response = {
    statusCode: 200,
    body: JSON.stringify("test"),
  };

  // All log statements are written to CloudWatch
  //console.info(`response from: ${event.path} statusCode: ${response.statusCode} body: ${response.body}`);
  return response;
};
