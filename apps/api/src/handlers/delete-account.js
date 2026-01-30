// Delete account handler - removes user data but keeps records (data points)
const mysql = require("serverless-mysql")({
  config: {
    host: process.env.ENDPOINT,
    database: process.env.DATABASE,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
  },
});

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'creditodds',
  });
}

const responseHeaders = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

exports.DeleteAccountHandler = async (event) => {
  console.info("DeleteAccount received:", event);

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ statusText: "OK" }),
    };
  }

  if (event.httpMethod !== "DELETE") {
    return {
      statusCode: 405,
      headers: responseHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const userId = event.requestContext?.authorizer?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers: responseHeaders,
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  try {
    // 1. Get all referral IDs for this user (to delete stats)
    const userReferrals = await mysql.query(
      "SELECT referral_id FROM referrals WHERE submitter_id = ?",
      [userId]
    );

    // 2. Delete referral stats for user's referrals
    if (userReferrals.length > 0) {
      const referralIds = userReferrals.map(r => r.referral_id);
      await mysql.query(
        `DELETE FROM referral_stats WHERE referral_id IN (?)`,
        [referralIds]
      );
    }

    // 3. Delete user's referrals
    await mysql.query(
      "DELETE FROM referrals WHERE submitter_id = ?",
      [userId]
    );

    // 4. Delete user's wallet entries
    await mysql.query(
      "DELETE FROM user_cards WHERE user_id = ?",
      [userId]
    );

    // 5. Anonymize records (keep data points but remove user association)
    // Set submitter_id to NULL to preserve data integrity while removing PII
    await mysql.query(
      "UPDATE records SET submitter_id = NULL WHERE submitter_id = ?",
      [userId]
    );

    await mysql.end();

    // 6. Delete Firebase user account
    try {
      await admin.auth().deleteUser(userId);
      console.info(`Firebase user ${userId} deleted successfully`);
    } catch (firebaseError) {
      // Log but don't fail if Firebase deletion fails
      // The user's data is already cleaned up
      console.error("Firebase user deletion failed:", firebaseError.message);
    }

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        message: "Account deleted successfully",
        deleted: {
          referrals: userReferrals.length,
          wallet_entries: "all",
          records_anonymized: "all"
        }
      }),
    };
  } catch (error) {
    console.error("Error deleting account:", error);
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: `Failed to delete account: ${error.message}` }),
    };
  }
};
