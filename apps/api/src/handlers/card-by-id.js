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

// Look up card in database by name and get stats
async function fetchCardFromDB(cardName) {
  try {
    // First find the card by name (fuzzy match - the CDN has "Card" suffix but DB might not)
    // Order by exact match first, then by card_id to get the oldest (original) entry
    const cardResults = await mysql.query(`
      SELECT card_id, card_name, card_image_link, accepting_applications, apply_link, card_referral_link
      FROM cards
      WHERE card_name = ? OR card_name = ? OR ? LIKE CONCAT(card_name, '%')
      ORDER BY
        CASE WHEN card_name = ? THEN 0
             WHEN card_name = ? THEN 1
             ELSE 2 END,
        card_id ASC
      LIMIT 1
    `, [cardName, cardName.replace(/ Card$/, ''), cardName, cardName, cardName.replace(/ Card$/, '')]);

    if (!cardResults || cardResults.length === 0) {
      await mysql.end();
      return null;
    }

    const dbCard = cardResults[0];

    // Get the stats and referrals in parallel
    const [statsResults, referralResults] = await Promise.all([
      mysql.query(`
        SELECT
          COUNT(*) as total_records,
          SUM(CASE WHEN result = 1 THEN 1 ELSE 0 END) as approved_count,
          SUM(CASE WHEN result = 0 THEN 1 ELSE 0 END) as rejected_count,
          (SELECT ROUND(AVG(credit_score)) FROM records WHERE card_id = ? AND result = 1 AND admin_review = 1) as approved_median_credit_score,
          (SELECT ROUND(AVG(listed_income)) FROM records WHERE card_id = ? AND result = 1 AND admin_review = 1) as approved_median_income,
          (SELECT ROUND(AVG(length_credit)) FROM records WHERE card_id = ? AND result = 1 AND admin_review = 1) as approved_median_length_credit
        FROM records
        WHERE card_id = ? AND admin_review = 1
      `, [dbCard.card_id, dbCard.card_id, dbCard.card_id, dbCard.card_id]),
      mysql.query(`
        SELECT referral_id, referral_link
        FROM referrals
        WHERE card_id = ? AND admin_approved = 1
      `, [dbCard.card_id])
    ]);

    await mysql.end();

    return {
      card_id: dbCard.card_id,
      card_image_link: dbCard.card_image_link,
      accepting_applications: dbCard.accepting_applications === 1,
      apply_link: dbCard.apply_link || null,
      card_referral_link: dbCard.card_referral_link || null,
      stats: statsResults[0] || {},
      referrals: referralResults || []
    };
  } catch (error) {
    console.error('Error fetching card from DB:', error);
    await mysql.end();
    return null;
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

        // Fetch card data and stats from MySQL using card name
        const dbData = await fetchCardFromDB(card.card_name || card.name);

        // Merge card data with database data
        // Use database card_id (numeric) for record submissions, keep CDN card_id as slug
        const enrichedCard = {
          ...card,
          card_id: dbData?.card_id || card.card_id, // Override with database numeric ID
          card_image_link: dbData?.card_image_link || card.image || null,
          accepting_applications: dbData?.accepting_applications !== undefined ? dbData.accepting_applications : card.accepting_applications,
          approved_count: dbData?.stats?.approved_count || 0,
          rejected_count: dbData?.stats?.rejected_count || 0,
          total_records: dbData?.stats?.total_records || 0,
          approved_median_credit_score: dbData?.stats?.approved_median_credit_score || null,
          approved_median_income: dbData?.stats?.approved_median_income || null,
          approved_median_length_credit: dbData?.stats?.approved_median_length_credit || null,
          apply_link: dbData?.apply_link || card.apply_link || null,
          card_referral_link: dbData?.card_referral_link || null,
          referrals: dbData?.referrals || [],
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
