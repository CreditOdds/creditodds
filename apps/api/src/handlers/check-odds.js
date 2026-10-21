const mysql = require("../db");
const { fetchCardsFromCDN } = require("../lib/cards-cdn");

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

// Read precomputed per-card stats from card_stats (totals + medians) plus card
// metadata. card_stats is refreshed every 5 min by RefreshCardStatsFunction and
// is what /cards and /card already read, so check-odds no longer scans the full
// records table (3 window-function CTEs + an aggregate) on every request — and
// its numbers now stay consistent with the rest of the site. Numeric card_stats
// columns are INT, so values arrive as JS numbers. SELECT * also supports
// deployment before migration 058: absent counts fail closed as unavailable.
async function fetchStatsAndMetadata() {
  const [statsResults, cardResults] = await Promise.all([
    mysql.query(`
      SELECT * FROM card_stats
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
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return ['Request body must be an object'];
  }

  if (!Number.isFinite(body.credit_score)) {
    errors.push('credit_score is required and must be a number');
  } else if (body.credit_score < 300 || body.credit_score > 850) {
    errors.push('credit_score must be between 300 and 850');
  }

  if (!Number.isFinite(body.income)) {
    errors.push('income is required and must be a number');
  } else if (body.income < 0) {
    errors.push('income must be 0 or greater');
  }

  if (!Number.isFinite(body.length_credit)) {
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
        let body;
        try { body = JSON.parse(event.body || '{}'); } catch {
          return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ errors: ['Invalid JSON'] }) };
        }
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
            // Each median has its own sample size; optional fields may have
            // fewer observations than the overall number of approvals.
            const compare = (field, value, min, max = Infinity) => {
              const count = stats[`approved_${field}_count`];
              const median = stats[`approved_median_${field}`];
              const sampleCount = Number.isInteger(count) && count >= 0 ? count : 0;
              const available = sampleCount >= 5 && Number.isFinite(median) && median >= min && median <= max;
              return { sampleCount, median: available ? median : null, above: available ? value >= median : null };
            };
            const score = compare('credit_score', credit_score, 300, 850);
            const earnings = compare('income', income, 0);
            const history = compare('length_credit', length_credit, 0, 100);
            const metrics = [score, earnings, history];
            const availableMetrics = metrics.filter(m => m.above !== null).length;
            const matchScore = metrics.filter(m => m.above === true).length;

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
              // Legacy clients assume this flag guarantees all three medians.
              has_enough_data: availableMetrics === 3,
              available_metrics: availableMetrics,
              credit_score_sample_count: score.sampleCount,
              income_sample_count: earnings.sampleCount,
              length_credit_sample_count: history.sampleCount,
              stats_updated_at: stats.updated_at || null,
              latest_approved_application: stats.latest_approved_application || null,
              median_credit_score: score.median,
              median_income: earnings.median,
              median_length_credit: history.median,
              above_credit_score: score.above,
              above_income: earnings.above,
              above_length_credit: history.above,
              match_score: matchScore,
            };
          });

        // Complete comparisons first, then partial ones. Keep a raw numerator
        // and explicit denominator: 1/1 is never presented as 3/3 or 100% odds.
        enrichedCards.sort((a, b) => {
          if (b.available_metrics !== a.available_metrics) return b.available_metrics - a.available_metrics;
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
        await mysql.end().catch(() => {});
        return {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: 'Failed to check odds' }),
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
          body: JSON.stringify({ error: 'Failed to fetch searches' }),
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
