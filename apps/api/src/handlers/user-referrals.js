// Create clients and set shared const values outside of the handler.
const mysql = require("../db");

const responseHeaders = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

exports.UserReferralsHandler = async (event) => {
  // All log statements are written to CloudWatch
  console.info("received:", event);

  let response = {};

  switch (event.httpMethod) {
    case "OPTIONS":
      //Preflight request header response
      response = {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({ statusText: "OK" }),
      };
      break;
    case "GET":
      try {
        const userId = event.requestContext.authorizer.sub;

        // Inline replacement for the legacy `creditodds.all_card_referrals` stored procedure.
        // Source-controlling the query here makes it grep-able and removes a hidden filter
        // that was hiding some users' approved referrals (the procedure required a join the
        // user's wallet/records still satisfied at submit time but might not now).
        // The client only reads response[0] (submitted), so we no longer compute the
        // "open eligible cards" list — that's already derived client-side from records + wallet.
        const submittedRaw = await mysql.query(
          `SELECT
             r.referral_id, r.card_id, r.referral_link, r.admin_approved,
             r.submit_datetime, r.archived_at, r.archived_reason,
             c.card_name, c.card_image_link, c.card_referral_link
           FROM referrals r
           JOIN cards c ON r.card_id = c.card_id
           WHERE r.submitter_id = ?
           ORDER BY r.submit_datetime DESC`,
          [userId]
        );
        const submitted = JSON.parse(JSON.stringify(submittedRaw));

        // Stats join, only if there's anything to look up
        if (submitted.length > 0) {
          const referralIds = submitted.map(r => r.referral_id);
          const statsResults = await mysql.query(
            `SELECT
               referral_id,
               SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END) as impressions,
               SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) as clicks,
               COUNT(DISTINCT CASE WHEN event_type = 'click'
                 THEN COALESCE(user_id, ip_hash) END) as unique_clicks
             FROM referral_stats
             WHERE referral_id IN (?)
             GROUP BY referral_id`,
            [referralIds]
          );

          const statsMap = {};
          for (const stat of statsResults) {
            statsMap[stat.referral_id] = {
              impressions: stat.impressions || 0,
              clicks: stat.clicks || 0,
              unique_clicks: stat.unique_clicks || 0,
            };
          }
          for (const referral of submitted) {
            const stats = statsMap[referral.referral_id] || { impressions: 0, clicks: 0, unique_clicks: 0 };
            referral.impressions = stats.impressions;
            referral.clicks = stats.clicks;
            referral.unique_clicks = stats.unique_clicks;
          }
        }

        await mysql.end();

        // Response shape kept as [submitted, open] for backwards compatibility with the
        // existing client; open is always [] now since the client computes it itself.
        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify([submitted, []]),
        };
      } catch (error) {
        response = {
          statusCode: 500,
          body: `There was an error with the query: ${error}`,
          headers: responseHeaders,
        };
      }
      break;
    case "POST":
      try {
        const postBody = JSON.parse(event.body);
        const userId = event.requestContext.authorizer.sub;

        // Check for existing active (non-archived) referral for this card by this user
        const existingActive = await mysql.query(
          "SELECT referral_id FROM referrals WHERE card_id = ? AND submitter_id = ? AND archived_at IS NULL",
          [postBody.card_id, userId]
        );
        if (existingActive.length > 0) {
          throw new Error("User has already submitted an active referral for this card.");
        }

        // Check if this exact link is used by another account (active only)
        const existingLink = await mysql.query(
          "SELECT referral_id FROM referrals WHERE referral_link = ? AND submitter_id != ? AND archived_at IS NULL",
          [postBody.referral_link, userId]
        );
        if (existingLink.length > 0) {
          throw new Error("This referral link has been used by another account.");
        }

        const referral = await mysql.query("INSERT INTO referrals SET ?", {
          card_id: postBody.card_id,
          referral_link: postBody.referral_link,
          submitter_id: userId,
          submitter_ip_address: event.requestContext.identity.sourceIp,
          submit_datetime: new Date(),
        });
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify(referral),
        };
      } catch (error) {
        response = {
          statusCode: 500,
          body: `There was an error with the query: ${error}`,
          headers: responseHeaders,
        };
      }
      break;
    case "PATCH":
      try {
        const patchBody = JSON.parse(event.body);
        const patchUserId = event.requestContext.authorizer.sub;

        if (!patchBody.referral_id) {
          throw new Error("referral_id is required");
        }

        // Verify the referral belongs to this user
        const referralToArchive = await mysql.query(
          "SELECT referral_id, archived_at FROM referrals WHERE referral_id = ? AND submitter_id = ?",
          [patchBody.referral_id, patchUserId]
        );

        if (referralToArchive.length === 0) {
          throw new Error("Referral not found or you don't have permission to archive it");
        }

        if (referralToArchive[0].archived_at) {
          throw new Error("Referral is already archived");
        }

        await mysql.query(
          "UPDATE referrals SET archived_at = NOW() WHERE referral_id = ?",
          [patchBody.referral_id]
        );
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ message: "Referral archived successfully" }),
        };
      } catch (error) {
        response = {
          statusCode: 500,
          body: `There was an error archiving the referral: ${error}`,
          headers: responseHeaders,
        };
      }
      break;
    default:
      response = {
        statusCode: 405,
        body: `UserReferrals only accepts GET, POST, and PATCH methods, you tried: ${event.httpMethod}`,
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
