// GET /card-records?card_name=<slug-or-name>
// Returns the raw approval-records for a card, projected to the public
// (non-PII) columns. Same admin_review=1 AND active=1 filter as /graphs.
// Used by the card-page "Raw data" view to back the table that's an
// alternative to the scatter-plot charts.

const https = require('https');
const mysql = require('../db');

const CARDS_URL = process.env.CARDS_JSON_URL || 'https://d2hxvzw7msbtvt.cloudfront.net/cards.json';

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
};

function fetchCardsFromCDN() {
  return new Promise((resolve, reject) => {
    https.get(CARDS_URL, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.cards || []);
        } catch (err) {
          reject(new Error('Failed to parse cards.json'));
        }
      });
    }).on('error', reject);
  });
}

exports.CardRecordsHandler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: responseHeaders,
      body: 'Method not allowed',
    };
  }

  const cardNameParam = event.queryStringParameters && event.queryStringParameters.card_name;
  if (!cardNameParam) {
    return {
      statusCode: 400,
      headers: responseHeaders,
      body: 'You must provide a card_name (slug or full name).',
    };
  }

  try {
    const cards = await fetchCardsFromCDN();
    const cdnCard = cards.find(
      (c) => c.card_name === cardNameParam || c.name === cardNameParam || c.slug === cardNameParam,
    );
    const card_name = cdnCard ? cdnCard.card_name || cdnCard.name : cardNameParam;

    const cardResult = await mysql.query(
      `SELECT card_id FROM cards
       WHERE card_name = ? OR card_name = ? OR ? LIKE CONCAT(card_name, '%')
       ORDER BY
         CASE WHEN card_name = ? THEN 0
              WHEN card_name = ? THEN 1
              ELSE 2 END,
         card_id ASC
       LIMIT 1`,
      [card_name, card_name.replace(/ Card$/, ''), card_name, card_name, card_name.replace(/ Card$/, '')],
    );

    if (!cardResult || cardResult.length === 0) {
      await mysql.end();
      return {
        statusCode: 404,
        headers: responseHeaders,
        body: `Card not found: ${card_name}`,
      };
    }

    const card_id = cardResult[0].card_id;

    // Explicit column list — keep submitter_id and submitter_ip_address out
    // of the public response.
    const records = await mysql.query(
      `SELECT
         record_id,
         credit_score,
         credit_score_source,
         result,
         listed_income,
         length_credit,
         starting_credit_limit,
         reason_denied,
         bank_customer,
         inquiries_3,
         inquiries_12,
         inquiries_24,
         submit_datetime,
         date_applied
       FROM records
       WHERE card_id = ? AND admin_review = 1 AND active = 1
       ORDER BY submit_datetime DESC`,
      [card_id],
    );
    await mysql.end();

    return {
      statusCode: 200,
      headers: { ...responseHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(records),
    };
  } catch (error) {
    console.error('card-records error:', error);
    try { await mysql.end(); } catch {}
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: `There was an error with the query: ${error.message || error}`,
    };
  }
};
