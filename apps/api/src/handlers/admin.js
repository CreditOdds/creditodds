// Comprehensive admin handler
const mysql = require("serverless-mysql")({
  config: {
    host: process.env.ENDPOINT,
    database: process.env.DATABASE,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
  },
});

// Fallback admin user IDs (Firebase UIDs) - used if custom claims not set
const FALLBACK_ADMIN_IDS = ['zXOyHmGl7HStyAqEdLsgXLA5inS2'];

// Check if user is admin via custom claim or fallback list
function isAdmin(event) {
  const userId = event.requestContext?.authorizer?.sub;
  const adminClaim = event.requestContext?.authorizer?.admin;

  // Check custom claim first (preferred method)
  if (adminClaim === 'true') {
    return true;
  }

  // Fallback to hardcoded list
  return FALLBACK_ADMIN_IDS.includes(userId);
}

const responseHeaders = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

// Helper to log admin actions
async function logAuditAction(adminId, action, entityType, entityId, details = null) {
  try {
    await mysql.query(
      "INSERT INTO audit_log (admin_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)",
      [adminId, action, entityType, entityId, details ? JSON.stringify(details) : null]
    );
  } catch (error) {
    console.error("Failed to log audit action:", error);
    // Don't throw - audit logging shouldn't break the main operation
  }
}

// ============ STATS HANDLER ============
exports.AdminStatsHandler = async (event) => {
  console.info("AdminStats received:", event);

  // Handle OPTIONS preflight BEFORE auth check (no auth headers on preflight)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: responseHeaders, body: JSON.stringify({ statusText: "OK" }) };
  }

  if (!isAdmin(event)) {
    return {
      statusCode: 403,
      headers: responseHeaders,
      body: JSON.stringify({ error: "Forbidden: Admin access required" }),
    };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: responseHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const [
      recordsCount,
      referralsCount,
      uniqueSubmitters,
      pendingReferrals,
      recordsToday,
      recordsThisWeek,
      topCards
    ] = await Promise.all([
      mysql.query("SELECT COUNT(*) as count FROM records"),
      mysql.query("SELECT COUNT(*) as count FROM referrals"),
      mysql.query("SELECT COUNT(DISTINCT submitter_id) as count FROM records"),
      mysql.query("SELECT COUNT(*) as count FROM referrals WHERE admin_approved = 0"),
      mysql.query("SELECT COUNT(*) as count FROM records WHERE DATE(submit_datetime) = CURDATE()"),
      mysql.query("SELECT COUNT(*) as count FROM records WHERE submit_datetime >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)"),
      mysql.query(`
        SELECT c.card_name, COUNT(r.record_id) as count
        FROM records r
        JOIN cards c ON r.card_id = c.card_id
        GROUP BY r.card_id, c.card_name
        ORDER BY count DESC
        LIMIT 10
      `)
    ]);

    await mysql.end();

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        total_records: recordsCount[0].count,
        total_referrals: referralsCount[0].count,
        total_users: uniqueSubmitters[0].count,
        pending_referrals: pendingReferrals[0].count,
        records_today: recordsToday[0].count,
        records_this_week: recordsThisWeek[0].count,
        top_cards: topCards
      }),
    };
  } catch (error) {
    console.error("Error fetching stats:", error);
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: `Failed to fetch stats: ${error.message}` }),
    };
  }
};

// ============ RECORDS HANDLER ============
exports.AdminRecordsHandler = async (event) => {
  console.info("AdminRecords received:", event);

  // Handle OPTIONS preflight BEFORE auth check
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: responseHeaders, body: JSON.stringify({ statusText: "OK" }) };
  }

  if (!isAdmin(event)) {
    return {
      statusCode: 403,
      headers: responseHeaders,
      body: JSON.stringify({ error: "Forbidden: Admin access required" }),
    };
  }

  const userId = event.requestContext?.authorizer?.sub;

  switch (event.httpMethod) {
    case "GET":
      try {
        const limit = parseInt(event.queryStringParameters?.limit) || 100;
        const offset = parseInt(event.queryStringParameters?.offset) || 0;

        const results = await mysql.query(`
          SELECT
            r.record_id,
            r.card_id,
            r.credit_score,
            r.listed_income,
            r.length_credit,
            r.result,
            r.submit_datetime,
            r.date_applied,
            r.submitter_id,
            r.submitter_ip_address,
            c.card_name,
            c.card_image_link,
            c.bank
          FROM records r
          JOIN cards c ON r.card_id = c.card_id
          ORDER BY r.submit_datetime DESC
          LIMIT ? OFFSET ?
        `, [limit, offset]);

        const countResult = await mysql.query("SELECT COUNT(*) as total FROM records");
        await mysql.end();

        return {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({
            records: results,
            total: countResult[0].total,
            limit,
            offset
          }),
        };
      } catch (error) {
        console.error("Error fetching records:", error);
        return {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: `Failed to fetch records: ${error.message}` }),
        };
      }

    case "DELETE":
      try {
        const recordId = event.queryStringParameters?.record_id;
        if (!recordId) {
          return {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "record_id is required" }),
          };
        }

        // Get record details for audit log
        const record = await mysql.query("SELECT * FROM records WHERE record_id = ?", [recordId]);
        if (record.length === 0) {
          return {
            statusCode: 404,
            headers: responseHeaders,
            body: JSON.stringify({ error: "Record not found" }),
          };
        }

        await mysql.query("DELETE FROM records WHERE record_id = ?", [recordId]);
        await logAuditAction(userId, 'DELETE', 'record', parseInt(recordId), record[0]);
        await mysql.end();

        return {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ message: "Record deleted", record_id: recordId }),
        };
      } catch (error) {
        console.error("Error deleting record:", error);
        return {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: `Failed to delete record: ${error.message}` }),
        };
      }

    default:
      return {
        statusCode: 405,
        headers: responseHeaders,
        body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed` }),
      };
  }
};

// ============ REFERRALS HANDLER ============
exports.AdminReferralsHandler = async (event) => {
  console.info("AdminReferrals received:", event);

  // Handle OPTIONS preflight BEFORE auth check
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: responseHeaders, body: JSON.stringify({ statusText: "OK" }) };
  }

  if (!isAdmin(event)) {
    return {
      statusCode: 403,
      headers: responseHeaders,
      body: JSON.stringify({ error: "Forbidden: Admin access required" }),
    };
  }

  const userId = event.requestContext?.authorizer?.sub;

  switch (event.httpMethod) {
    case "GET":
      try {
        const limit = parseInt(event.queryStringParameters?.limit) || 100;
        const offset = parseInt(event.queryStringParameters?.offset) || 0;
        const pendingOnly = event.queryStringParameters?.pending === 'true';

        let whereClause = pendingOnly ? "WHERE r.admin_approved = 0" : "";

        const results = await mysql.query(`
          SELECT
            r.referral_id,
            r.card_id,
            r.referral_link,
            r.submitter_id,
            r.submit_datetime,
            r.admin_approved,
            c.card_name,
            c.card_image_link,
            c.bank,
            c.card_referral_link,
            COALESCE(stats.impressions, 0) as impressions,
            COALESCE(stats.clicks, 0) as clicks
          FROM referrals r
          JOIN cards c ON r.card_id = c.card_id
          LEFT JOIN (
            SELECT referral_id,
              SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END) as impressions,
              SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) as clicks
            FROM referral_stats
            GROUP BY referral_id
          ) stats ON r.referral_id = stats.referral_id
          ${whereClause}
          ORDER BY r.admin_approved ASC, r.submit_datetime DESC
          LIMIT ? OFFSET ?
        `, [limit, offset]);

        const countQuery = pendingOnly
          ? "SELECT COUNT(*) as total FROM referrals WHERE admin_approved = 0"
          : "SELECT COUNT(*) as total FROM referrals";
        const countResult = await mysql.query(countQuery);
        await mysql.end();

        return {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({
            referrals: results,
            total: countResult[0].total,
            limit,
            offset
          }),
        };
      } catch (error) {
        console.error("Error fetching referrals:", error);
        return {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: `Failed to fetch referrals: ${error.message}` }),
        };
      }

    case "PUT":
      try {
        const body = JSON.parse(event.body);
        const { referral_id, approved, referral_link } = body;

        if (!referral_id || approved === undefined) {
          return {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "referral_id and approved are required" }),
          };
        }

        // Get referral details for audit log
        const referral = await mysql.query("SELECT * FROM referrals WHERE referral_id = ?", [referral_id]);
        if (referral.length === 0) {
          return {
            statusCode: 404,
            headers: responseHeaders,
            body: JSON.stringify({ error: "Referral not found" }),
          };
        }

        if (referral_link) {
          await mysql.query(
            "UPDATE referrals SET admin_approved = ?, referral_link = ? WHERE referral_id = ?",
            [approved ? 1 : 0, referral_link, referral_id]
          );
        } else {
          await mysql.query(
            "UPDATE referrals SET admin_approved = ? WHERE referral_id = ?",
            [approved ? 1 : 0, referral_id]
          );
        }
        const auditDetails = referral_link
          ? { ...referral[0], updated_referral_link: referral_link }
          : referral[0];
        await logAuditAction(userId, approved ? 'APPROVE' : 'UNAPPROVE', 'referral', referral_id, auditDetails);
        await mysql.end();

        return {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({
            message: approved ? "Referral approved" : "Referral unapproved",
            referral_id
          }),
        };
      } catch (error) {
        console.error("Error updating referral:", error);
        return {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: `Failed to update referral: ${error.message}` }),
        };
      }

    case "DELETE":
      try {
        const referralId = event.queryStringParameters?.referral_id;
        if (!referralId) {
          return {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "referral_id is required" }),
          };
        }

        // Get referral details for audit log
        const referral = await mysql.query("SELECT * FROM referrals WHERE referral_id = ?", [referralId]);
        if (referral.length === 0) {
          return {
            statusCode: 404,
            headers: responseHeaders,
            body: JSON.stringify({ error: "Referral not found" }),
          };
        }

        await mysql.query("DELETE FROM referral_stats WHERE referral_id = ?", [referralId]);
        await mysql.query("DELETE FROM referrals WHERE referral_id = ?", [referralId]);
        await logAuditAction(userId, 'DELETE', 'referral', parseInt(referralId), referral[0]);
        await mysql.end();

        return {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ message: "Referral deleted", referral_id: referralId }),
        };
      } catch (error) {
        console.error("Error deleting referral:", error);
        return {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: `Failed to delete referral: ${error.message}` }),
        };
      }

    default:
      return {
        statusCode: 405,
        headers: responseHeaders,
        body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed` }),
      };
  }
};

// ============ AUDIT LOG HANDLER ============
exports.AdminAuditHandler = async (event) => {
  console.info("AdminAudit received:", event);

  // Handle OPTIONS preflight BEFORE auth check
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: responseHeaders, body: JSON.stringify({ statusText: "OK" }) };
  }

  if (!isAdmin(event)) {
    return {
      statusCode: 403,
      headers: responseHeaders,
      body: JSON.stringify({ error: "Forbidden: Admin access required" }),
    };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: responseHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const limit = parseInt(event.queryStringParameters?.limit) || 100;
    const offset = parseInt(event.queryStringParameters?.offset) || 0;

    const results = await mysql.query(`
      SELECT a.*
      FROM audit_log a
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const countResult = await mysql.query("SELECT COUNT(*) as total FROM audit_log");
    await mysql.end();

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        logs: results,
        total: countResult[0].total,
        limit,
        offset
      }),
    };
  } catch (error) {
    console.error("Error fetching audit log:", error);
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: `Failed to fetch audit log: ${error.message}` }),
    };
  }
};
