// Delete account handler - removes user data but keeps records (data points)
const mysql = require("../db");
const { initFirebase } = require('../lib/firebase-init');
const brevo = require('../lib/brevo');

// Shared init: uses FIREBASE_SERVICE_ACCOUNT_B64 when present, which is what
// makes the privileged deleteUser() call below actually succeed.
const admin = initFirebase();

const responseHeaders = {
  // Authenticated, user-specific responses: never cache at browser or any
  // shared edge (CloudFront/proxy). Belt-and-suspenders for routing the API
  // through a CDN without leaking one user's data to another.
  "Cache-Control": "no-store",
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

exports.DeleteAccountHandler = async (event) => {
  console.info("DeleteAccount received:", event.httpMethod, event.path);

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
    // 1. Anonymize referrals (keep rows + referral_stats intact, remove user association)
    await mysql.query(
      "UPDATE referrals SET submitter_id = NULL WHERE submitter_id = ?",
      [userId]
    );

    // 2. Delete user's wallet entries
    await mysql.query(
      "DELETE FROM user_cards WHERE user_id = ?",
      [userId]
    );

    // 3. Anonymize records (keep data points but remove user association)
    await mysql.query(
      "UPDATE records SET submitter_id = NULL WHERE submitter_id = ?",
      [userId]
    );

    await mysql.end();

    // 4. Delete Firebase user account
    try {
      await admin.auth().deleteUser(userId);
      console.info(`Firebase user ${userId} deleted successfully`);
    } catch (firebaseError) {
      // Log but don't fail if Firebase deletion fails
      // The user's data is already cleaned up
      console.error("Firebase user deletion failed:", firebaseError.message);
    }

    // 5. Remove from the newsletter audience (best-effort; the daily
    // newsletter-sync prune also catches this if the call fails here)
    const email = event.requestContext?.authorizer?.email;
    if (email && brevo.isConfigured()) {
      try {
        await brevo.deleteContact(email);
        console.info(`Brevo contact removed for ${userId}`);
      } catch (brevoError) {
        console.error("Brevo contact deletion failed:", brevoError.message);
      }
    }

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        message: "Account deleted successfully",
        deleted: {
          wallet_entries: "all",
          referrals_anonymized: "all",
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
