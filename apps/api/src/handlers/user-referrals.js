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

        // Get impression/click counts, card_referral_link, and archived status for submitted referrals
        if (submitted.length > 0) {
          const referralIds = submitted.map(r => r.referral_id).filter(id => id);
          const cardIds = submitted.map(r => r.card_id).filter(id => id);

          // Fetch stats, card referral links, and archived status in parallel
          const [statsResults, cardResults, archivedResults] = await Promise.all([
            referralIds.length > 0 ? mysql.query(`
              SELECT
                referral_id,
                SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END) as impressions,
                SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) as clicks,
                COUNT(DISTINCT CASE WHEN event_type = 'click'
                  THEN COALESCE(user_id, ip_hash) END) as unique_clicks
              FROM referral_stats
              WHERE referral_id IN (?)
              GROUP BY referral_id
            `, [referralIds]) : [],
            cardIds.length > 0 ? mysql.query(`
              SELECT card_id, card_referral_link
              FROM cards
              WHERE card_id IN (?)
            `, [cardIds]) : [],
            referralIds.length > 0 ? mysql.query(`
              SELECT referral_id, archived_at, archived_reason
              FROM referrals
              WHERE referral_id IN (?)
            `, [referralIds]) : []
          ]);

          // Create a map of stats by referral_id
          const statsMap = {};
          for (const stat of statsResults) {
            statsMap[stat.referral_id] = {
              impressions: stat.impressions || 0,
              clicks: stat.clicks || 0,
              unique_clicks: stat.unique_clicks || 0
            };
          }

          // Create a map of card_referral_link by card_id
          const cardLinkMap = {};
          for (const card of cardResults) {
            cardLinkMap[card.card_id] = card.card_referral_link;
          }

          // Create maps of archived_at and archived_reason by referral_id
          const archivedMap = {};
          const archivedReasonMap = {};
          for (const row of archivedResults) {
            archivedMap[row.referral_id] = row.archived_at;
            archivedReasonMap[row.referral_id] = row.archived_reason;
          }

          // Add stats, card_referral_link, and archived_at to submitted referrals
          for (const referral of submitted) {
            const stats = statsMap[referral.referral_id] || { impressions: 0, clicks: 0, unique_clicks: 0 };
            referral.impressions = stats.impressions;
            referral.clicks = stats.clicks;
            referral.unique_clicks = stats.unique_clicks;
            referral.card_referral_link = cardLinkMap[referral.card_id] || null;
            referral.archived_at = archivedMap[referral.referral_id] || null;
            referral.archived_reason = archivedReasonMap[referral.referral_id] || null;
          }
        }

        // Also include cards with only archived referrals in the "open" list
        const archivedCardIds = new Set(
          submitted.filter(r => r.archived_at).map(r => r.card_id)
        );
        const activeCardIds = new Set(
          submitted.filter(r => !r.archived_at).map(r => r.card_id)
        );
        // Cards that only have archived referrals (no active one) should appear in open
        for (const cardId of archivedCardIds) {
          if (!activeCardIds.has(cardId)) {
            const archivedRef = submitted.find(r => r.card_id === cardId && r.archived_at);
            if (archivedRef && !open.some(o => o.card_id === cardId)) {
              open.push({
                card_id: archivedRef.card_id,
                card_name: archivedRef.card_name,
                card_image_link: archivedRef.card_image_link,
              });
            }
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
