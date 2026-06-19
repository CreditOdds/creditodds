const https = require('https');
const mysql = require("../db");

const CARDS_URL = process.env.CARDS_JSON_URL || 'https://d2hxvzw7msbtvt.cloudfront.net/cards.json';

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

// Fetch cards.json from CloudFront
async function fetchCardsFromCDN() {
  return new Promise((resolve, reject) => {
    https.get(CARDS_URL, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.cards);
        } catch (err) {
          reject(new Error('Failed to parse cards.json'));
        }
      });
    }).on('error', reject);
  });
}

// Read precomputed per-card stats from card_stats (totals + medians) plus card
// metadata. card_stats is refreshed every 5 min by RefreshCardStatsFunction and
// is what /cards and /card already read, so check-odds no longer scans the full
// records table (3 window-function CTEs + an aggregate) on every request — and
// its numbers now stay consistent with the rest of the site. All card_stats
// columns are INT, so values arrive as JS numbers.
async function fetchStatsAndMetadata() {
  const [statsResults, cardResults] = await Promise.all([
    mysql.query(`
      SELECT
        card_id,
        total_records,
        approved_count,
        approved_median_credit_score,
        approved_median_income,
        approved_median_length_credit
      FROM card_stats
    `),
    mysql.query(`
      SELECT card_id, card_name, card_image_link, accepting_applications, tags
      FROM cards
    `)
  ]);

  const statsMap = {};
  for (const row of statsResults) {
    statsMap[row.card_id] = row;
  }

  const cardMap = {};
  for (const row of cardResults) {
    let tags = row.tags;
    if (typeof tags === 'string') {
      try { tags = JSON.parse(tags); } catch (e) { tags = null; }
    }
    cardMap[row.card_name] = {
      db_card_id: row.card_id,
      card_image_link: row.card_image_link,
      accepting_applications: row.accepting_applications === 1,
      tags: tags || []
    };
  }

  return { statsMap, cardMap };
}

// Validate input
function validateInput(body) {
  const errors = [];

  if (body.credit_score == null || typeof body.credit_score !== 'number') {
    errors.push('credit_score is required and must be a number');
  } else if (body.credit_score < 300 || body.credit_score > 850) {
    errors.push('credit_score must be between 300 and 850');
  }

  if (body.income == null || typeof body.income !== 'number') {
    errors.push('income is required and must be a number');
  } else if (body.income < 0) {
    errors.push('income must be 0 or greater');
  }

  if (body.length_credit == null || typeof body.length_credit !== 'number') {
    errors.push('length_credit is required and must be a number');
  } else if (body.length_credit < 0 || body.length_credit > 100) {
    errors.push('length_credit must be between 0 and 100');
  }

  return errors;
}

exports.CheckOddsHandler = async (event) => {
  console.info("CheckOdds received:", event.httpMethod, event.path);

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ statusText: "OK" }),
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

  switch (event.httpMethod) {
    case "POST": {
      try {
        const body = JSON.parse(event.body || '{}');
        const errors = validateInput(body);
        if (errors.length > 0) {
          return {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ errors }),
          };
        }

        const { credit_score, income, length_credit } = body;

        // Save search (deduplicated by unique key)
        await mysql.query(
          `INSERT IGNORE INTO approval_searches (user_id, credit_score, income, length_credit)
           VALUES (?, ?, ?, ?)`,
          [userId, credit_score, income, length_credit]
        );

        // Fetch all data in parallel
        const [cards, { statsMap, cardMap }] = await Promise.all([
          fetchCardsFromCDN(),
          fetchStatsAndMetadata(),
        ]);

        await mysql.end();

        // Merge and enrich card data
        const enrichedCards = cards
          .filter(card => {
            const dbCard = cardMap[card.card_name] || cardMap[card.name] || {};
            return dbCard.accepting_applications !== false && card.accepting_applications !== false;
          })
          .map(card => {
            const dbCard = cardMap[card.card_name] || cardMap[card.name] || {};
            const stats = statsMap[dbCard.db_card_id] || {};

            const approvedCount = stats.approved_count || 0;
            const hasEnoughData = approvedCount >= 5;

            const medianCreditScore = stats.approved_median_credit_score;
            const medianIncome = stats.approved_median_income;
            const medianLengthCredit = stats.approved_median_length_credit;

            let matchScore = 0;
            if (hasEnoughData) {
              if (credit_score >= medianCreditScore) matchScore++;
              if (income >= medianIncome) matchScore++;
              if (length_credit >= medianLengthCredit) matchScore++;
            }

            return {
              card_id: card.card_id,
              card_name: card.card_name,
              slug: card.slug,
              bank: card.bank,
              card_image_link: dbCard.card_image_link || card.image || null,
              annual_fee: card.annual_fee,
              reward_type: card.reward_type,
              tags: dbCard.tags || card.tags || [],
              approved_count: stats.approved_count || 0,
              total_records: stats.total_records || 0,
              approved_data_points: approvedCount,
              has_enough_data: hasEnoughData,
              median_credit_score: hasEnoughData ? medianCreditScore : null,
              median_income: hasEnoughData ? medianIncome : null,
              median_length_credit: hasEnoughData ? medianLengthCredit : null,
              above_credit_score: hasEnoughData ? credit_score >= medianCreditScore : null,
              above_income: hasEnoughData ? income >= medianIncome : null,
              above_length_credit: hasEnoughData ? length_credit >= medianLengthCredit : null,
              match_score: matchScore,
            };
          });

        // Sort by match score desc, then by total records desc
        enrichedCards.sort((a, b) => {
          if (b.match_score !== a.match_score) return b.match_score - a.match_score;
          if (b.has_enough_data !== a.has_enough_data) return b.has_enough_data ? 1 : -1;
          return (b.total_records || 0) - (a.total_records || 0);
        });

        return {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({
            cards: enrichedCards,
            search: { credit_score, income, length_credit },
          }),
        };
      } catch (error) {
        console.error('Error in POST /check-odds:', error);
        return {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: `Failed to check odds: ${error.message}` }),
        };
      }
    }

    case "GET": {
      try {
        const searches = await mysql.query(
          `SELECT id, credit_score, income, length_credit, created_at
           FROM approval_searches
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT 20`,
          [userId]
        );
        await mysql.end();

        return {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify(searches),
        };
      } catch (error) {
        console.error('Error in GET /check-odds:', error);
        return {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: `Failed to fetch searches: ${error.message}` }),
        };
      }
    }

    default:
      return {
        statusCode: 405,
        headers: responseHeaders,
        body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed` }),
      };
  }
};
