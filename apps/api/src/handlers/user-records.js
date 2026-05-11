// Create clients and set shared const values outside of the handler.
const mysql = require("../db");

// Yup Schema Validation for Record Submit
const yup = require("yup");

// End of the current month — date_applied is a "month" input on the client,
// so we accept anything up to and including the last day of this month.
function endOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

// Structured codes for the issuer-cited reason on a denial. Stored alongside
// the free-text reason_denied for analytics. Keep in sync with the
// REASON_DENIED_CODES constant on the client.
const REASON_DENIED_CODES = [
  "too_many_inquiries",
  "too_many_recent_accounts",
  "length_of_credit_too_short",
  "credit_score_too_low",
  "high_utilization",
  "too_much_credit_with_issuer",
  "income_too_low",
  "recent_delinquency",
  "bankruptcy_or_public_record",
  "other",
  "not_specified",
];

const recordSchema = yup.object().shape({
  card_id: yup.number().integer().required(),
  credit_score: yup.number().integer().min(300).max(850).required(),
  credit_score_source: yup.number().integer().min(0).max(4).required(),
  result: yup.boolean().required(),
  listed_income: yup.number().integer().min(0).max(1000000).nullable(),
  length_credit: yup.number().integer().min(0).max(100),
  starting_credit_limit: yup.number().integer().min(0).max(1000000),
  reason_denied: yup.string().max(254),
  reason_denied_code: yup.string().oneOf(REASON_DENIED_CODES).nullable(),
  total_open_cards: yup.number().integer().min(0).max(500).nullable(),
  date_applied: yup.date().max(endOfCurrentMonth(), "Application date cannot be in the future").required(),
  bank_customer: yup.boolean().required(),
  inquiries_3: yup.number().integer().min(0).max(50),
  inquiries_12: yup.number().integer().min(0).max(50),
  inquiries_24: yup.number().integer().min(0).max(50),
});

// PATCH only allows editing the user-correctable fields. card_id is fixed
// (use delete + new submit to change card). submitter_id, IPs, timestamps,
// active, and admin_review are server-controlled.
const recordPatchSchema = yup.object().shape({
  credit_score: yup.number().integer().min(300).max(850).required(),
  credit_score_source: yup.number().integer().min(0).max(4).required(),
  result: yup.boolean().required(),
  listed_income: yup.number().integer().min(0).max(1000000).nullable(),
  length_credit: yup.number().integer().min(0).max(100).nullable(),
  starting_credit_limit: yup.number().integer().min(0).max(1000000).nullable(),
  reason_denied: yup.string().max(254).nullable(),
  reason_denied_code: yup.string().oneOf(REASON_DENIED_CODES).nullable(),
  total_open_cards: yup.number().integer().min(0).max(500).nullable(),
  date_applied: yup.date().max(endOfCurrentMonth(), "Application date cannot be in the future").required(),
  bank_customer: yup.boolean().required(),
  inquiries_3: yup.number().integer().min(0).max(50).nullable(),
  inquiries_12: yup.number().integer().min(0).max(50).nullable(),
  inquiries_24: yup.number().integer().min(0).max(50).nullable(),
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
          `SELECT r.record_id, r.card_id, c.card_name, c.card_image_link,
                  r.credit_score, r.credit_score_source, r.listed_income,
                  r.length_credit, r.result, r.starting_credit_limit, r.reason_denied,
                  r.reason_denied_code, r.total_open_cards,
                  r.bank_customer, r.inquiries_3, r.inquiries_12, r.inquiries_24,
                  r.submit_datetime, r.date_applied
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

            // Check for duplicate submission (same card, credit score, income, result).
            // Use `<=>` (NULL-safe equal) on listed_income since it's nullable now —
            // two NULL incomes should still count as the same submission.
            const duplicateResult = await mysql.query(
              `SELECT record_id FROM records
               WHERE card_id = ? AND submitter_id = ? AND credit_score = ?
               AND listed_income <=> ? AND result = ? AND active = 1
               LIMIT 1`,
              [value.card_id, submitterId, value.credit_score, value.listed_income ?? null, value.result]
            );
            if (duplicateResult.length > 0) {
              throw new Error('You have already submitted a record with the same credit score, income, and result for this card.');
            }

            // If approved, clear denial fields; if denied, clear starting credit limit.
            if (value.result) {
              value.reason_denied = null;
              value.reason_denied_code = null;
            } else {
              value.starting_credit_limit = null;
            }
            const results = await mysql.query("INSERT INTO records SET ?", {
              card_id: value.card_id,
              result: value.result,
              credit_score: value.credit_score,
              credit_score_source: value.credit_score_source,
              listed_income: value.listed_income ?? null,
              date_applied: new Date(value.date_applied),
              length_credit: value.length_credit,
              starting_credit_limit: value.starting_credit_limit,
              submitter_id: submitterId,
              submitter_ip_address: event.requestContext.identity.sourceIp,
              submit_datetime: new Date(),
              bank_customer: value.bank_customer,
              reason_denied: value.reason_denied,
              reason_denied_code: value.reason_denied_code ?? null,
              total_open_cards: value.total_open_cards ?? null,
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
    case "PATCH":
      try {
        const recordId = event.queryStringParameters?.record_id;
        if (!recordId) {
          throw new Error("record_id is required");
        }

        const submitterId = event.requestContext.authorizer.sub;
        const value = await recordPatchSchema.validate(event.body).catch((err) => {
          throw new Error(`Validation error: ${err}.`);
        });

        // Mirror POST: clear the fields that don't apply to the result.
        if (value.result) {
          value.reason_denied = null;
          value.reason_denied_code = null;
        } else {
          value.starting_credit_limit = null;
        }

        // Owner-scoped update. Re-set admin_review = 1 so edits remain visible
        // (admin can re-vet via the existing admin tools if needed).
        const result = await mysql.query(
          `UPDATE records SET ? WHERE record_id = ? AND submitter_id = ? AND active = 1`,
          [
            {
              credit_score: value.credit_score,
              credit_score_source: value.credit_score_source,
              result: value.result,
              listed_income: value.listed_income ?? null,
              length_credit: value.length_credit,
              starting_credit_limit: value.starting_credit_limit,
              reason_denied: value.reason_denied,
              reason_denied_code: value.reason_denied_code ?? null,
              total_open_cards: value.total_open_cards ?? null,
              date_applied: new Date(value.date_applied),
              bank_customer: value.bank_customer,
              inquiries_3: value.inquiries_3,
              inquiries_12: value.inquiries_12,
              inquiries_24: value.inquiries_24,
              admin_review: 1,
            },
            recordId,
            submitterId,
          ]
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
            body: JSON.stringify({ success: true, message: "Record updated" }),
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
        body: `This endpoint accepts GET, POST, PATCH, and DELETE methods, you tried: ${event.httpMethod}`,
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
