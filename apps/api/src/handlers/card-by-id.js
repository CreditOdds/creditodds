// Fetch card details from CloudFront CDN and MySQL
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

// Fetch detailed stats for a specific card from MySQL
async function fetchCardDetailedStats(cardId) {
  try {
    const results = await mysql.query(`
      SELECT
        COUNT(*) as total_records,
        SUM(CASE WHEN result = 1 THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN result = 0 THEN 1 ELSE 0 END) as rejected_count,
        (SELECT ROUND(AVG(credit_score)) FROM records WHERE card_id = ? AND result = 1 AND admin_review = 1) as approved_median_credit_score,
        (SELECT ROUND(AVG(listed_income)) FROM records WHERE card_id = ? AND result = 1 AND admin_review = 1) as approved_median_income,
        (SELECT ROUND(AVG(length_credit)) FROM records WHERE card_id = ? AND result = 1 AND admin_review = 1) as approved_median_length_credit
      FROM records
      WHERE card_id = ? AND admin_review = 1
    `, [cardId, cardId, cardId, cardId]);
    await mysql.end();

    return results[0] || {};
  } catch (error) {
    console.error('Error fetching card stats:', error);
    return {};
  }
}

exports.CardByIdHandler = async (event) => {
  console.info("received:", event);

  let response = {};

  switch (event.httpMethod) {
    case "GET":
      try {
        if (!event.queryStringParameters || !event.queryStringParameters.card_name) {
          response = {
            statusCode: 400,
            body: `You must provide a card name in the proper format.`,
            headers: responseHeaders,
          };
          break;
        }

        const cardName = event.queryStringParameters.card_name;

        // Fetch cards from CDN
        const cards = await fetchCardsFromCDN();

        // Find card by name (supports both full name and slug)
        const card = cards.find(c =>
          c.card_name === cardName ||
          c.name === cardName ||
          c.slug === cardName
        );

        if (!card) {
          response = {
            statusCode: 404,
            body: `Card not found: ${cardName}`,
            headers: responseHeaders,
          };
          break;
        }

        // Fetch detailed stats from MySQL
        const stats = await fetchCardDetailedStats(card.card_id);

        // Merge card data with stats
        const enrichedCard = {
          ...card,
          approved_count: stats.approved_count || 0,
          rejected_count: stats.rejected_count || 0,
          total_records: stats.total_records || 0,
          approved_median_credit_score: stats.approved_median_credit_score || null,
          approved_median_income: stats.approved_median_income || null,
          approved_median_length_credit: stats.approved_median_length_credit || null,
        };

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify(enrichedCard),
        };
        break;
      } catch (error) {
        console.error('Error:', error);
        response = {
          statusCode: 500,
          body: `There was an error with the query: ${error.message}`,
          headers: responseHeaders,
        };
        break;
      }
    default:
      response = {
        statusCode: 405,
        body: `CardById only accepts GET method, you tried: ${event.httpMethod}`,
        headers: responseHeaders,
      };
      break;
  }

  console.info(
    `response from: ${event.path} statusCode: ${response.statusCode} body: ${response.body}`
  );
  return response;
};
