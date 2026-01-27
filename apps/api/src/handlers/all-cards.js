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

// Fetch card stats and metadata from MySQL
async function fetchCardStatsAndMetadata() {
  try {
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
    await mysql.end();

    // Convert stats to lookup map
    const statsMap = {};
    for (const row of statsResults) {
      statsMap[row.card_id] = row;
    }

    // Convert card metadata to lookup map (by card_name)
    const cardMap = {};
    for (const row of cardResults) {
      // Parse tags JSON if it's a string
      let tags = row.tags;
      if (typeof tags === 'string') {
        try {
          tags = JSON.parse(tags);
        } catch (e) {
          tags = null;
        }
      }
      cardMap[row.card_name] = {
        db_card_id: row.card_id,
        card_image_link: row.card_image_link,
        accepting_applications: row.accepting_applications === 1,
        tags: tags || []
      };
    }

    return { statsMap, cardMap };
  } catch (error) {
    console.error('Error fetching card data from MySQL:', error);
    return { statsMap: {}, cardMap: {} };
  }
}

exports.AllCardsHandler = async (event) => {
  console.info("received:", event);

  let response = {};

  switch (event.httpMethod) {
    case "GET":
      try {
        // Fetch cards from CDN and stats/metadata from MySQL in parallel
        const [cards, { statsMap, cardMap }] = await Promise.all([
          fetchCardsFromCDN(),
          fetchCardStatsAndMetadata(),
        ]);

        // Merge card data with stats and metadata from database
        const enrichedCards = cards.map(card => {
            const stats = statsMap[card.card_id] || {};
            const dbCard = cardMap[card.card_name] || cardMap[card.name] || {};
            return {
              ...card,
              db_card_id: dbCard.db_card_id || null,
              approved_count: stats.approved_count || 0,
              rejected_count: stats.rejected_count || 0,
              total_records: stats.total_records || 0,
              card_image_link: dbCard.card_image_link || card.image || null,
              accepting_applications: dbCard.accepting_applications !== undefined ? dbCard.accepting_applications : card.accepting_applications,
              tags: dbCard.tags || card.tags || [],
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
