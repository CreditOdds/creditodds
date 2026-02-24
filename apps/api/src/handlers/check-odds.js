const https = require('https');

const mysql = require("serverless-mysql")({
  config: {
    host: process.env.ENDPOINT,
    database: process.env.DATABASE,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
  },
});

const CARDS_URL = process.env.CARDS_JSON_URL || 'https://d2hxvzw7msbtvt.cloudfront.net/cards.json';

const responseHeaders = {
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

// Fetch card stats and metadata from MySQL
async function fetchCardStatsAndMetadata() {
  const [statsResults, cardResults] = await Promise.all([
    mysql.query(`
      SELECT
        card_id,
        COUNT(*) as total_records,
        SUM(CASE WHEN result = 1 THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN result = 0 THEN 1 ELSE 0 END) as rejected_count
      FROM records
      WHERE admin_review = 1
      GROUP BY card_id
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

// Compute medians for all cards using ROW_NUMBER() CTEs
async function fetchApprovedMedians() {
  const [creditScoreResults, incomeResults, lengthCreditResults] = await Promise.all([
    mysql.query(`
      WITH ranked AS (
        SELECT card_id, credit_score,
          ROW_NUMBER() OVER (PARTITION BY card_id ORDER BY credit_score) AS rn,
          COUNT(*) OVER (PARTITION BY card_id) AS cnt
        FROM records
        WHERE admin_review = 1 AND result = 1
      )
      SELECT card_id,
        AVG(credit_score) AS median_credit_score,
        MAX(cnt) AS approved_count
      FROM ranked
      WHERE rn IN (FLOOR((cnt + 1) / 2), CEIL((cnt + 1) / 2))
      GROUP BY card_id
    `),
    mysql.query(`
      WITH ranked AS (
        SELECT card_id, listed_income,
          ROW_NUMBER() OVER (PARTITION BY card_id ORDER BY listed_income) AS rn,
          COUNT(*) OVER (PARTITION BY card_id) AS cnt
        FROM records
        WHERE admin_review = 1 AND result = 1
      )
      SELECT card_id,
        AVG(listed_income) AS median_income
      FROM ranked
      WHERE rn IN (FLOOR((cnt + 1) / 2), CEIL((cnt + 1) / 2))
      GROUP BY card_id
    `),
    mysql.query(`
      WITH ranked AS (
        SELECT card_id, length_credit,
          ROW_NUMBER() OVER (PARTITION BY card_id ORDER BY length_credit) AS rn,
          COUNT(*) OVER (PARTITION BY card_id) AS cnt
        FROM records
        WHERE admin_review = 1 AND result = 1
      )
      SELECT card_id,
        AVG(length_credit) AS median_length_credit
      FROM ranked
      WHERE rn IN (FLOOR((cnt + 1) / 2), CEIL((cnt + 1) / 2))
      GROUP BY card_id
    `)
  ]);

  const medianMap = {};

  for (const row of creditScoreResults) {
    medianMap[row.card_id] = {
      median_credit_score: Math.round(row.median_credit_score),
      approved_count: row.approved_count,
    };
  }
  for (const row of incomeResults) {
    if (medianMap[row.card_id]) {
      medianMap[row.card_id].median_income = Math.round(row.median_income);
    }
  }
  for (const row of lengthCreditResults) {
    if (medianMap[row.card_id]) {
      medianMap[row.card_id].median_length_credit = Math.round(row.median_length_credit);
    }
  }

  return medianMap;
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
  console.info("CheckOdds received:", event);

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
        const [cards, { statsMap, cardMap }, medianMap] = await Promise.all([
          fetchCardsFromCDN(),
          fetchCardStatsAndMetadata(),
          fetchApprovedMedians(),
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
            const medians = medianMap[dbCard.db_card_id] || {};

            const approvedCount = medians.approved_count || 0;
            const hasEnoughData = approvedCount >= 5;

            let matchScore = 0;
            if (hasEnoughData) {
              if (credit_score >= medians.median_credit_score) matchScore++;
              if (income >= medians.median_income) matchScore++;
              if (length_credit >= medians.median_length_credit) matchScore++;
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
              median_credit_score: hasEnoughData ? medians.median_credit_score : null,
              median_income: hasEnoughData ? medians.median_income : null,
              median_length_credit: hasEnoughData ? medians.median_length_credit : null,
              above_credit_score: hasEnoughData ? credit_score >= medians.median_credit_score : null,
              above_income: hasEnoughData ? income >= medians.median_income : null,
              above_length_credit: hasEnoughData ? length_credit >= medians.median_length_credit : null,
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
