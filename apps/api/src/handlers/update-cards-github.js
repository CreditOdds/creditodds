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

// Extract metric values from a CDN card for change detection
function extractMetrics(cdnCard) {
  let rewardTopRate = null;
  let rewardTopUnit = null;
  if (cdnCard.rewards && cdnCard.rewards.length > 0) {
    const topReward = cdnCard.rewards.reduce(
      (best, r) => (r.value > (best?.value || 0) ? r : best),
      null
    );
    if (topReward) {
      rewardTopRate = topReward.value;
      rewardTopUnit = topReward.unit;
    }
  }

  return {
    annual_fee: cdnCard.annual_fee ?? null,
    signup_bonus_value: cdnCard.signup_bonus?.value ?? null,
    signup_bonus_type: cdnCard.signup_bonus?.type ?? null,
    reward_top_rate: rewardTopRate,
    reward_top_unit: rewardTopUnit,
    apr_min: cdnCard.apr?.regular?.min ?? null,
    apr_max: cdnCard.apr?.regular?.max ?? null,
  };
}

// Compare old and new metrics, insert card_wire rows for any changes
async function detectAndRecordChanges(cardId, oldMetrics, newMetrics) {
  const trackedFields = [
    { field: "annual_fee", old: oldMetrics.annual_fee, new: newMetrics.annual_fee },
    { field: "signup_bonus_value", old: oldMetrics.signup_bonus_value, new: newMetrics.signup_bonus_value },
    { field: "reward_top_rate", old: oldMetrics.reward_top_rate, new: newMetrics.reward_top_rate },
    { field: "apr_min", old: oldMetrics.apr_min, new: newMetrics.apr_min },
    { field: "apr_max", old: oldMetrics.apr_max, new: newMetrics.apr_max },
  ];

  const changes = [];
  for (const t of trackedFields) {
    const oldStr = t.old != null ? String(t.old) : null;
    const newStr = t.new != null ? String(t.new) : null;

    // Skip if values match or both null
    if (oldStr === newStr) continue;

    // Skip initial backfill (old is null = first time populating metrics)
    if (oldStr === null) continue;

    changes.push({ field: t.field, old_value: oldStr, new_value: newStr });
  }

  if (changes.length > 0) {
    const placeholders = changes.map(() => "(?, ?, ?, ?)").join(", ");
    const flat = changes.flatMap((c) => [cardId, c.field, c.old_value, c.new_value]);
    await mysql.query(
      `INSERT INTO card_wire (card_id, field, old_value, new_value) VALUES ${placeholders}`,
      flat
    );
  }

  return changes;
}

// Sync cards from CDN to MySQL database
async function syncCardsToDatabase(cdnCards) {
  const results = {
    added: [],
    updated: [],
    errors: [],
    wire_changes: [],
  };

  try {
    // Get existing cards from database (include metric columns for change detection)
    const existingCards = await mysql.query(
      `SELECT card_id, card_name, bank, annual_fee,
              signup_bonus_value, signup_bonus_type,
              reward_top_rate, reward_top_unit,
              apr_min, apr_max
       FROM cards`
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
          // Detect metric changes before updating
          const newMetrics = extractMetrics(cdnCard);
          const changes = await detectAndRecordChanges(
            existingCard.card_id,
            existingCard,
            newMetrics
          );
          if (changes.length > 0) {
            results.wire_changes.push({ card: name, changes });
          }

          // Update existing card (including metric snapshot columns)
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
              card_referral_link = ?,
              signup_bonus_value = ?,
              signup_bonus_type = ?,
              reward_top_rate = ?,
              reward_top_unit = ?,
              apr_min = ?,
              apr_max = ?
            WHERE card_id = ?`,
            [
              name, bank, acceptingApplications,
              cdnCard.image || null, cdnCard.release_date || null, tagsJson,
              newMetrics.annual_fee, cdnCard.apply_link || null, cdnCard.card_referral_link || null,
              newMetrics.signup_bonus_value, newMetrics.signup_bonus_type,
              newMetrics.reward_top_rate, newMetrics.reward_top_unit,
              newMetrics.apr_min, newMetrics.apr_max,
              existingCard.card_id,
            ]
          );
          results.updated.push(name);
        } else {
          // Insert new card - get next available card_id
          const newMetrics = extractMetrics(cdnCard);
          const maxIdResult = await mysql.query("SELECT MAX(card_id) as max_id FROM cards");
          const nextId = (maxIdResult[0]?.max_id || 0) + 1;
          await mysql.query(
            `INSERT INTO cards (card_id, card_name, bank, accepting_applications, card_image_link,
              release_date, tags, annual_fee, apply_link, card_referral_link,
              signup_bonus_value, signup_bonus_type, reward_top_rate, reward_top_unit,
              apr_min, apr_max, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
              nextId, name, bank, acceptingApplications,
              cdnCard.image || null, cdnCard.release_date || null, tagsJson,
              newMetrics.annual_fee, cdnCard.apply_link || null, cdnCard.card_referral_link || null,
              newMetrics.signup_bonus_value, newMetrics.signup_bonus_type,
              newMetrics.reward_top_rate, newMetrics.reward_top_unit,
              newMetrics.apr_min, newMetrics.apr_max,
            ]
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
