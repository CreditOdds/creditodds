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

const median = (arr) => {
  const mid = Math.floor(arr.length / 2),
    nums = [...arr].sort((a, b) => a - b);
  return arr.length % 2 !== 0
    ? nums[mid]
    : ((nums[mid - 1] + nums[mid]) / 2) | null;
};

/**
 * A simple example includes a HTTP get method to get one item by id from a DynamoDB table.
 */
exports.updateHighLevelHandler = async (event) => {
  // All log statements are written to CloudWatch
  console.info("received:", event);

  let cards = await mysql.query("SELECT card_id FROM cards");

  // Run clean up function
  await mysql.end();
  console.log(cards);
  const cardIds = cards.map((element) => element.card_id);
  console.log(cardIds);

  await mysql.query("DELETE FROM high_level");
  await mysql.end();

  for (var i = 0; i < cardIds.length; i++) {
    console.log(cardIds[i])
    let resultsData = await mysql.query(
      "SELECT * FROM records WHERE card_id = ? AND admin_review = 1",
      [cardIds[i]]
    );
    await mysql.end();
    let results = {};
    results.approved_count = JSON.parse(JSON.stringify(resultsData)).filter(
      function (element) {
        return element.result == 1;
      }
    ).length;

    results.rejected_count = JSON.parse(JSON.stringify(resultsData)).filter(
      function (element) {
        return element.result == 0;
      }
    ).length;

    results.approved_median_income = median(
      JSON.parse(JSON.stringify(resultsData))
        .filter(function (element) {
          return element.result == 1 && element.listed_income != null;
        })
        .map((element) => {
          return element["listed_income"];
        })
    );
    results.approved_median_credit_score = median(
      JSON.parse(JSON.stringify(resultsData))
        .filter(function (element) {
          return element.result == 1 && element.listed_income != null;
        })
        .map((element) => {
          return element["credit_score"];
        })
    );
    results.approved_median_length_credit = median(
      JSON.parse(JSON.stringify(resultsData))
        .filter(function (element) {
          return element.result == 1 && element.length_credit != null;
        })
        .map((element) => {
          return element["length_credit"];
        })
    );
    results.card_id = cardIds[i];
    results.update_datetime = new Date();
    console.log(results);
    const high_level =   await mysql.query('INSERT INTO high_level SET ?', results);
    await mysql.end()
  }

  const response = {
    statusCode: 200,
    body: JSON.stringify("test"),
  };

  // All log statements are written to CloudWatch
  //console.info(`response from: ${event.path} statusCode: ${response.statusCode} body: ${response.body}`);
  return response;
};
