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
        let results = await mysql.query("call creditodds.user_records(?)", [
          event.requestContext.authorizer.claims.sub,
        ]);
        // Run clean up function
        await mysql.end();
        results = JSON.parse(JSON.stringify(results[0]));

        if (results.length > 0) {
          approvedCards = results.filter(function (element) {
            return element.result == 1;
          });
          let daysOfCredit = 0;
          approvedCards.forEach((element) => {
            daysOfCredit += parseInt(
              (new Date() - Date.parse(element.date_applied.toString())) /
                86400000
            );
          });
          const aaoa = parseInt(daysOfCredit / approvedCards.length);
          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify([aaoa]),
          };
        } else {
          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify([]),
          };
        }

        break;
      } catch (error) {
        response = {
          statusCode: 500,
          body: `Error: ${error}`,
          headers: responseHeaders,
        };
        break;
      }
    default:
      //Throw an error if the request method is not GET
      response = {
        statusCode: 405,
        body: `getCardGraphs only accepts GET and POST method, you tried: ${event.httpMethod}`,
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
