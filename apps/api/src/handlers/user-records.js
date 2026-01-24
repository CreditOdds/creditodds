// Create clients and set shared const values outside of the handler.
const mysql = require("serverless-mysql")({
  config: {
    host: process.env.ENDPOINT,
    database: process.env.DATABASE,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
  },
});

// Yup Schema Validation for Record Submit
const yup = require("yup");
const recordSchema = yup.object().shape({
  credit_score: yup.number().integer().min(300).max(850).required(),
  credit_score_source: yup.number().integer().min(0).max(4).required(),
  result: yup.boolean().required(),
  listed_income: yup.number().integer().min(0).max(1000000).required(),
  length_credit: yup.number().integer().min(0).max(100).required(),
  starting_credit_limit: yup.number().integer().min(0).max(1000000),
  reason_denied: yup.string().max(254),
  date_applied: yup.date().required(),
  bank_customer: yup.boolean().required(),
  inquiries_3: yup.number().integer().min(0).max(50),
  inquiries_12: yup.number().integer().min(0).max(50),
  inquiries_24: yup.number().integer().min(0).max(50),
});

const responseHeaders = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

exports.UserRecordsHandler = async (event) => {
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

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify(results),
        };
        break;
      } catch (error) {
        response = {
          statusCode: 500,
          body: `Error: ${error}`,
          headers: responseHeaders,
        };
        break;
      }
    case "POST":
      try {
        //Check to see if this user has submitter fewer than 2 times
        let count = await mysql.query(
          "call creditodds.count_submit_records(?,?)",
          [
            JSON.parse(event.body).card_id,
            event.requestContext.authorizer.claims.sub,
          ]
        );
        count = JSON.parse(JSON.stringify(count))[0][0]["count"];
        if (count >= 2) {
          throw new Error(
            `User has already submitted 2 or more records for this card.`
          );
        }

        const apiResponse = await recordSchema
          .validate(event.body)
          .then(async function (value) {
            console.log(value);
            //If accepted submit starting credit limit, otherwise reason denied
            value.result
              ? (value.reason_denied = null)
              : (value.starting_credit_limit = null);
            const results = await mysql.query("INSERT INTO records SET ?", {
              card_id: value.card_id,
              result: value.result,
              credit_score: value.credit_score,
              credit_score_source: value.credit_score_source,
              listed_income: value.listed_income,
              date_applied: new Date(value.date_applied),
              length_credit: value.length_credit,
              starting_credit_limit: value.starting_credit_limit,
              submitter_id: event.requestContext.authorizer.claims.sub,
              submitter_ip_address: event.requestContext.identity.sourceIp,
              submit_datetime: new Date(),
              starting_credit_limit: value.starting_credit_limit,
              bank_customer: value.bank_customer,
              reason_denied: value.reason_denied,
              inquiries_3: value.inquiries_3,
              inquiries_12: value.inquiries_12,
              inquiries_24: value.inquiries_24,
            });
            await mysql.end();
            return results;
          })
          .catch(function (err) {
            throw new Error(`Validation error: ${err}.`);
          });
        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify(apiResponse),
        };
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
