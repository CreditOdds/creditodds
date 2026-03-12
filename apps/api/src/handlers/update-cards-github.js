const https = require("https");

const mysql = require("serverless-mysql")({
  config: {
    host: process.env.ENDPOINT,
    database: process.env.DATABASE,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
  },
});

const CARDS_URL = process.env.CardsJsonUrl || "https://d2hxvzw7msbtvt.cloudfront.net/cards.json";

// Fetch cards.json from CloudFront CDN
async function fetchCardsFromCDN() {
  return new Promise((resolve, reject) => {
    // Add cache-busting query param to get fresh data after deploy
    const url = `${CARDS_URL}?t=${Date.now()}`;
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.cards || []);
          } catch (err) {
            reject(new Error("Failed to parse cards.json"));
          }
        });
      })
      .on("error", reject);
  });
}

// Sync cards from CDN to MySQL database
async function syncCardsToDatabase(cdnCards) {
  const results = {
    added: [],
    updated: [],
    errors: [],
  };

  try {
    // Get existing cards from database
    const existingCards = await mysql.query(
      "SELECT card_id, card_name, bank FROM cards"
    );

    // Create lookup map by card_name
    const existingByName = {};
    for (const card of existingCards) {
      existingByName[card.card_name] = card;
    }

    // Helper: find existing card by exact name, or fuzzy match (with/without suffix)
    function findExistingCard(name) {
      if (existingByName[name]) return existingByName[name];
      // Try common suffixes that may still be in the DB from before name standardization
      const suffixes = [' Card', ' Credit Card', ' card', ' credit card'];
      for (const suffix of suffixes) {
        if (existingByName[name + suffix]) return existingByName[name + suffix];
      }
      // Try stripping suffixes in case CDN has suffix but DB doesn't
      for (const suffix of suffixes) {
        if (name.endsWith(suffix) && existingByName[name.slice(0, -suffix.length)]) {
          return existingByName[name.slice(0, -suffix.length)];
        }
      }
      return null;
    }

    for (const cdnCard of cdnCards) {
      try {
        const name = cdnCard.name;
        const bank = cdnCard.bank;
        const acceptingApplications = cdnCard.accepting_applications ? 1 : 0;

        // Check if card exists by name (with fuzzy suffix matching)
        const existingCard = findExistingCard(name);

        // Convert tags array to JSON string for database storage
        const tagsJson = cdnCard.tags ? JSON.stringify(cdnCard.tags) : null;

        if (existingCard) {
          // Update existing card
          await mysql.query(
            `UPDATE cards SET
              card_name = ?,
              bank = ?,
              accepting_applications = ?,
              card_image_link = ?,
              release_date = ?,
              tags = ?,
              annual_fee = ?,
              apply_link = ?,
              card_referral_link = ?
            WHERE card_id = ?`,
            [name, bank, acceptingApplications, cdnCard.image || null, cdnCard.release_date || null, tagsJson, cdnCard.annual_fee || null, cdnCard.apply_link || null, cdnCard.card_referral_link || null, existingCard.card_id]
          );
          results.updated.push(name);
        } else {
          // Insert new card - get next available card_id
          const maxIdResult = await mysql.query("SELECT MAX(card_id) as max_id FROM cards");
          const nextId = (maxIdResult[0]?.max_id || 0) + 1;
          await mysql.query(
            `INSERT INTO cards (card_id, card_name, bank, accepting_applications, card_image_link, release_date, tags, annual_fee, apply_link, card_referral_link, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [nextId, name, bank, acceptingApplications, cdnCard.image || null, cdnCard.release_date || null, tagsJson, cdnCard.annual_fee || null, cdnCard.apply_link || null, cdnCard.card_referral_link || null]
          );
          results.added.push(name);
        }
      } catch (cardError) {
        console.error(`Error processing card ${cdnCard.name}:`, cardError);
        results.errors.push({ card: cdnCard.name, error: cardError.message });
      }
    }

    await mysql.end();
  } catch (error) {
    console.error("Error syncing cards to database:", error);
    throw error;
  }

  return results;
}

/**
 * Handler for GitHub webhook events.
 * Syncs cards from CDN to MySQL when a PR is merged.
 * Can also be triggered manually via workflow_dispatch.
 */
exports.updateCardsGitHubHandler = async (event) => {
  console.info("received:", JSON.stringify(event, null, 2));

  let shouldSync = false;
  let triggerReason = "";

  // Handle GitHub webhook payload (PR merged)
  if (event.body) {
    try {
      const payload = JSON.parse(event.body);
      if (payload.action === "closed" && payload.pull_request?.merged === true) {
        shouldSync = true;
        triggerReason = `PR #${payload.pull_request.number} merged: ${payload.pull_request.title}`;
      }
    } catch (e) {
      console.log("Could not parse body as JSON, checking other triggers");
    }
  }

  // Handle direct invocation (e.g., from GitHub Actions workflow_dispatch)
  if (event.action === "closed" && event.pull_request?.merged === true) {
    shouldSync = true;
    triggerReason = `PR #${event.pull_request.number} merged: ${event.pull_request.title}`;
  }

  // Handle manual trigger
  if (event.source === "manual" || event.httpMethod === "POST") {
    shouldSync = true;
    triggerReason = "Manual trigger";
  }

  if (!shouldSync) {
    console.log("No sync needed for this event");
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "No action needed" }),
    };
  }

  console.log(`Syncing cards: ${triggerReason}`);

  try {
    // Fetch cards from CDN
    const cdnCards = await fetchCardsFromCDN();
    console.log(`Fetched ${cdnCards.length} cards from CDN`);

    // Sync to database
    const results = await syncCardsToDatabase(cdnCards);

    console.log("Sync results:", JSON.stringify(results, null, 2));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Cards synced successfully",
        trigger: triggerReason,
        added: results.added.length,
        updated: results.updated.length,
        errors: results.errors.length,
        details: results,
      }),
    };
  } catch (error) {
    console.error("Error syncing cards:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error syncing cards",
        error: error.message,
      }),
    };
  }
};
