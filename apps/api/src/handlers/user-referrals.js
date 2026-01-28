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
        // Run stored procedure query
        let results = await mysql.query(
          "call creditodds.all_card_referrals(?)",
          [event.requestContext.authorizer.sub]
        );
        results = JSON.parse(JSON.stringify(results[0]));

        //Splits response into already submitted referrals and cards user hasn't submitted referrals for (open)
        const submitted = results.filter(function (element) {
          return element.referral_link != null;
        });
        const open = results.filter(function (element) {
          return element.referral_link == null;
        });

        // Get impression/click counts and card_referral_link for submitted referrals
        if (submitted.length > 0) {
          const referralIds = submitted.map(r => r.referral_id).filter(id => id);
          const cardIds = submitted.map(r => r.card_id).filter(id => id);

          // Fetch stats and card referral links in parallel
          const [statsResults, cardResults] = await Promise.all([
            referralIds.length > 0 ? mysql.query(`
              SELECT
                referral_id,
                SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END) as impressions,
                SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) as clicks
              FROM referral_stats
              WHERE referral_id IN (?)
              GROUP BY referral_id
            `, [referralIds]) : [],
            cardIds.length > 0 ? mysql.query(`
              SELECT card_id, card_referral_link
              FROM cards
              WHERE card_id IN (?)
            `, [cardIds]) : []
          ]);

          // Create a map of stats by referral_id
          const statsMap = {};
          for (const stat of statsResults) {
            statsMap[stat.referral_id] = {
              impressions: stat.impressions || 0,
              clicks: stat.clicks || 0
            };
          }

          // Create a map of card_referral_link by card_id
          const cardLinkMap = {};
          for (const card of cardResults) {
            cardLinkMap[card.card_id] = card.card_referral_link;
          }

          // Add stats and card_referral_link to submitted referrals
          for (const referral of submitted) {
            const stats = statsMap[referral.referral_id] || { impressions: 0, clicks: 0 };
            referral.impressions = stats.impressions;
            referral.clicks = stats.clicks;
            referral.card_referral_link = cardLinkMap[referral.card_id] || null;
          }
        }

        // Run clean up function
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify([submitted, open]),
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
        console.log(JSON.parse(event.body).card_id);
        console.log(JSON.parse(event.body).referral_link);
        let count = await mysql.query("call creditodds.check_referral(?,?,?)", [
          JSON.parse(event.body).card_id,
          event.requestContext.authorizer.sub,
          JSON.parse(event.body).referral_link,
        ]);
        await mysql.end();
        console.log(count);
        count = JSON.parse(JSON.stringify(count))[0][0]["count"];
        console.log(count);

        if (count > 0) {
          throw new Error(
            `User has already submitted a referral for this card or this referral link has been used by another account.`
          );
        }

        const referral = await mysql.query("INSERT INTO referrals SET ?", {
          card_id: JSON.parse(event.body).card_id,
          referral_link: JSON.parse(event.body).referral_link,
          submitter_id: event.requestContext.authorizer.sub,
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
    case "DELETE":
      try {
        const referralId = event.queryStringParameters?.referral_id;
        if (!referralId) {
          throw new Error("referral_id is required");
        }

        // Verify the referral belongs to this user before deleting
        const referral = await mysql.query(
          "SELECT referral_id FROM referrals WHERE referral_id = ? AND submitter_id = ?",
          [referralId, event.requestContext.authorizer.sub]
        );

        if (referral.length === 0) {
          throw new Error("Referral not found or you don't have permission to delete it");
        }

        // Delete associated stats first
        await mysql.query("DELETE FROM referral_stats WHERE referral_id = ?", [referralId]);

        // Delete the referral
        await mysql.query("DELETE FROM referrals WHERE referral_id = ?", [referralId]);
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ message: "Referral deleted successfully" }),
        };
      } catch (error) {
        response = {
          statusCode: 500,
          body: `There was an error deleting the referral: ${error}`,
          headers: responseHeaders,
        };
      }
      break;
    default:
      //Throw an error if the request method is not GET
      response = {
        statusCode: 405,
        body: `UserReferrals only accepts GET, POST, and DELETE methods, you tried: ${event.httpMethod}`,
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
