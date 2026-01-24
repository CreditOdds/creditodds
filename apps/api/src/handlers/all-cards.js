// Fetch cards from CloudFront CDN
const https = require('https');

// MySQL client for fetching card stats (approval rates, etc.)
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
  "Access-Control-Allow-Origin": "*",
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

// Fetch card stats from MySQL (approval counts, medians, etc.)
async function fetchCardStats() {
  try {
    const results = await mysql.query(`
      SELECT
        card_id,
        COUNT(*) as total_records,
        SUM(CASE WHEN result = 1 THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN result = 0 THEN 1 ELSE 0 END) as rejected_count
      FROM records
      WHERE admin_review = 1
      GROUP BY card_id
    `);
    await mysql.end();

    // Convert to lookup map
    const statsMap = {};
    for (const row of results) {
      statsMap[row.card_id] = row;
    }
    return statsMap;
  } catch (error) {
    console.error('Error fetching card stats:', error);
    return {};
  }
}

exports.AllCardsHandler = async (event) => {
  console.info("received:", event);

  let response = {};

  switch (event.httpMethod) {
    case "GET":
      try {
        // Fetch cards from CDN and stats from MySQL in parallel
        const [cards, statsMap] = await Promise.all([
          fetchCardsFromCDN(),
          fetchCardStats(),
        ]);

        // Merge card data with stats
        const enrichedCards = cards
          .filter(card => card.accepting_applications)
          .map(card => {
            const stats = statsMap[card.card_id] || {};
            return {
              ...card,
              approved_count: stats.approved_count || 0,
              rejected_count: stats.rejected_count || 0,
              total_records: stats.total_records || 0,
            };
          });

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify(enrichedCards),
        };
        break;
      } catch (error) {
        console.error('Error:', error);
        response = {
          statusCode: 500,
          body: `There was an error fetching cards: ${error.message}`,
          headers: responseHeaders,
        };
        break;
      }
    default:
      response = {
        statusCode: 405,
        body: `AllCards only accepts GET method, you tried: ${event.httpMethod}`,
        headers: responseHeaders,
      };
      break;
  }

  console.info(
    `response from: ${event.path} statusCode: ${response.statusCode} body: ${response.body}`
  );
  return response;
};
