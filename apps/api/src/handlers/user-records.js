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
  card_id: yup.number().integer().required(),
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

// Constants for spam prevention
const MAX_RECORDS_PER_CARD_PER_USER = 5;

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
        let results = await mysql.query(
          `SELECT r.record_id, c.card_name, c.card_image_link, r.credit_score,
                  r.listed_income, r.length_credit, r.result, r.submit_datetime, r.date_applied
           FROM records r
           JOIN cards c ON r.card_id = c.card_id
           WHERE r.submitter_id = ? AND r.active = 1
           ORDER BY r.submit_datetime DESC`,
          [event.requestContext.authorizer.sub]
        );
        await mysql.end();
        results = JSON.parse(JSON.stringify(results));

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
        const apiResponse = await recordSchema
          .validate(event.body)
          .then(async function (value) {
            console.log(value);
            const submitterId = event.requestContext.authorizer.sub;

            // Check if user has reached max records for this card
            const countResult = await mysql.query(
              `SELECT COUNT(*) as count FROM records
               WHERE card_id = ? AND submitter_id = ? AND active = 1`,
              [value.card_id, submitterId]
            );
            if (countResult[0].count >= MAX_RECORDS_PER_CARD_PER_USER) {
              throw new Error(`You can only submit ${MAX_RECORDS_PER_CARD_PER_USER} records per card.`);
            }

            // Check for duplicate submission (same card, credit score, income, result)
            const duplicateResult = await mysql.query(
              `SELECT record_id FROM records
               WHERE card_id = ? AND submitter_id = ? AND credit_score = ?
               AND listed_income = ? AND result = ? AND active = 1
               LIMIT 1`,
              [value.card_id, submitterId, value.credit_score, value.listed_income, value.result]
            );
            if (duplicateResult.length > 0) {
              throw new Error('You have already submitted a record with the same credit score, income, and result for this card.');
            }

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
              submitter_id: submitterId,
              submitter_ip_address: event.requestContext.identity.sourceIp,
              submit_datetime: new Date(),
              bank_customer: value.bank_customer,
              reason_denied: value.reason_denied,
              inquiries_3: value.inquiries_3,
              inquiries_12: value.inquiries_12,
              inquiries_24: value.inquiries_24,
              admin_review: 1,
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
    case "DELETE":
      try {
        const recordId = event.queryStringParameters?.record_id;
        if (!recordId) {
          throw new Error("record_id is required");
        }

        // Soft delete - set active = 0 only for records owned by this user
        const result = await mysql.query(
          `UPDATE records SET active = 0
           WHERE record_id = ? AND submitter_id = ?`,
          [recordId, event.requestContext.authorizer.sub]
        );
        await mysql.end();

        if (result.affectedRows === 0) {
          response = {
            statusCode: 404,
            headers: responseHeaders,
            body: JSON.stringify({ error: "Record not found or not owned by user" }),
          };
        } else {
          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({ success: true, message: "Record deleted" }),
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
      response = {
        statusCode: 405,
        body: `This endpoint accepts GET, POST, and DELETE methods, you tried: ${event.httpMethod}`,
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
