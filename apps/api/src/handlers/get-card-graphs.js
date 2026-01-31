// Create MySQL client and set shared const values outside of the handler.
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

exports.getCardGraphsHandler = async (event) => {
  // All log statements are written to CloudWatch
  console.info("received:", event);

  let response;

  switch (event.httpMethod) {
    case "GET":
      if (!event.queryStringParameters || !event.queryStringParameters.card_name) {
        response = {
          statusCode: 400,
          body: `You must provide a card name in the proper format.`,
          headers: responseHeaders,
        };
        break;
      } else {
        // Get id from queryStringParameters from APIGateway
        const cardNameParam = event.queryStringParameters.card_name;

        try {
          // Fetch cards from CDN to support slug lookup
          const cards = await fetchCardsFromCDN();

          // Find card by name or slug
          const cdnCard = cards.find(c =>
            c.card_name === cardNameParam ||
            c.name === cardNameParam ||
            c.slug === cardNameParam
          );

          // Use the actual card_name from CDN, or fall back to the parameter
          const card_name = cdnCard ? (cdnCard.card_name || cdnCard.name) : cardNameParam;

          // Get card_id from cards table (with fuzzy matching for card suffix)
          // Order by exact match first, then by card_id to get the oldest (original) entry
          let cardResult = await mysql.query(
            `SELECT card_id FROM cards
             WHERE card_name = ? OR card_name = ? OR ? LIKE CONCAT(card_name, '%')
             ORDER BY
               CASE WHEN card_name = ? THEN 0
                    WHEN card_name = ? THEN 1
                    ELSE 2 END,
               card_id ASC
             LIMIT 1`,
            [card_name, card_name.replace(/ Card$/, ''), card_name, card_name, card_name.replace(/ Card$/, '')]
          );
          await mysql.end();

          if (!cardResult || cardResult.length === 0) {
            response = {
              statusCode: 404,
              body: `Card not found: ${card_name}`,
              headers: responseHeaders,
            };
            break;
          }

          const card_id = cardResult[0].card_id;
          let resultsData = await mysql.query(
            "SELECT * FROM records WHERE card_id = ? AND admin_review = 1",
            [card_id]
          );

          await mysql.end();

          resultsData = JSON.parse(JSON.stringify(resultsData));

          //Credit Score vs Income
          acceptedFinal = resultsData
            .filter(function (element) {
              return (
                element.result == 1 &&
                element.credit_score != null &&
                element.listed_income != null
              );
            })
            .map((x) => [x.credit_score, x.listed_income]);
          rejectedFinal = resultsData
            .filter(function (element) {
              return (
                element.result == 0 &&
                element.credit_score != null &&
                element.listed_income != null
              );
            })
            .map((x) => [x.credit_score, x.listed_income]);
          let chartOne = [acceptedFinal, rejectedFinal];

          //Credit Score vs Length of Credit
          acceptedFinal = resultsData
            .filter(function (element) {
              return (
                element.result == 1 &&
                element.credit_score != null &&
                element.length_credit != null
              );
            })
            .map((x) => [x.length_credit, x.credit_score]);
          rejectedFinal = resultsData
            .filter(function (element) {
              return (
                element.result == 0 &&
                element.credit_score != null &&
                element.length_credit != null
              );
            })
            .map((x) => [x.length_credit, x.credit_score]);
          let chartTwo = [acceptedFinal, rejectedFinal];

          //Income vs Starting Credit Limit (approved only, with valid values)
          let chartThreeData = resultsData
            .filter(function (element) {
              return (
                element.result == 1 &&
                element.starting_credit_limit != null &&
                element.starting_credit_limit > 0 &&
                element.listed_income != null &&
                element.listed_income > 0
              );
            })
            .map((x) => [x.listed_income, x.starting_credit_limit]);
          let chartThree = [chartThreeData];

          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify([chartOne, chartTwo, chartThree]),
          };

          break;
        } catch (error) {
          response = {
            statusCode: 500,
            body: `There was an error with the query: ${error}`,
            headers: responseHeaders,
          };
          break;
        }
      }
    default:
      //Throw an error if the request method is not GET
      response = {
        statusCode: 405,
        body: `CardGraphs only accepts GET method, you tried: ${event.httpMethod}`,
        headers: responseHeaders,
      };
      break;
  }

  // All log statements are written to CloudWatch
  console.info(
    `response from: ${event.path} statusCode: ${response.statusCode} body: ${response.body}`
  );

  return response;
};
