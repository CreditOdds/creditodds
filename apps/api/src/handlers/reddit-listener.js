/**
 * Reddit Listener Lambda Handler
 *
 * Scheduled via EventBridge to poll r/creditcards for approval/denial data points.
 * Uses Claude Haiku to extract structured data from Reddit posts, then inserts
 * qualifying records into the DB with admin_review = 0 for manual approval.
 */

const mysql = require("serverless-mysql")({
  config: {
    host: process.env.ENDPOINT,
    database: process.env.DATABASE,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
  },
});

// Reddit API configuration
const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUBREDDITS = ['CreditCards'];
const MAX_POSTS_PER_RUN = 50;
const MAX_INSERTS_PER_RUN = 20;

/**
 * Get Reddit OAuth token using client credentials (app-only, read-only access)
 */
async function getRedditToken() {
  const credentials = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'CreditOdds-RedditListener/1.0',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Reddit auth failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Fetch recent posts from a subreddit
 */
async function fetchSubredditPosts(token, subreddit) {
  const response = await fetch(
    `https://oauth.reddit.com/r/${subreddit}/new?limit=${MAX_POSTS_PER_RUN}&t=day`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'CreditOdds-RedditListener/1.0',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data?.children?.map(c => c.data) || [];
}

/**
 * Filter posts that likely contain approval/denial data points
 */
function filterRelevantPosts(posts) {
  const keywords = [
    'approved', 'denied', 'approval', 'denial',
    'data point', 'dp:', 'got the', 'was approved', 'was denied',
    'instant approval', 'instantly approved', 'credit limit',
    'fico', 'credit score', 'vantage',
  ];

  return posts.filter(post => {
    const text = `${post.title} ${post.selftext || ''}`.toLowerCase();
    return keywords.some(kw => text.includes(kw));
  });
}

/**
 * Load cards from the database for card name matching
 */
async function loadCards() {
  const cards = await mysql.query(
    "SELECT card_id, card_name, bank FROM cards WHERE active = 1"
  );
  return cards;
}

/**
 * Get already-processed Reddit post URLs to avoid duplicates
 */
async function getProcessedUrls() {
  const results = await mysql.query(
    "SELECT source_url FROM records WHERE source = 'reddit' AND source_url IS NOT NULL"
  );
  return new Set(results.map(r => r.source_url));
}

/**
 * Use Claude to extract structured data from a Reddit post
 */
async function extractDataPoint(post, cardsList) {
  const cardsRef = cardsList
    .map(c => `- ${c.card_name} (bank: ${c.bank}, card_id: ${c.card_id})`)
    .join('\n');

  const postText = `Title: ${post.title}\n\nBody: ${post.selftext || '(no body)'}`;

  const prompt = `You are a data extraction system for credit card approval/denial reports. Extract structured data from this Reddit post.

## Reddit Post
${postText}

## Card Database (match card names to these)
${cardsRef}

## Instructions
Extract ALL data points from this post. A single post may contain multiple data points (e.g., someone reporting approvals for multiple cards).

For each data point, extract:
- card_id (REQUIRED): Must match a card_id from the database above. If the card isn't in our database, skip it.
- result (REQUIRED): true = approved, false = denied
- credit_score (REQUIRED): 300-850 range. If not mentioned, skip this data point.
- credit_score_source: 0=Unknown, 1=FICO, 2=VantageScore, 3=Experian, 4=TransUnion. Default 0.
- listed_income: Annual income in dollars. Only include if explicitly stated.
- length_credit: Years of credit history. Only include if explicitly stated.
- starting_credit_limit: Credit limit received (approvals only). Only include if stated.
- bank_customer: true/false - whether they mentioned being an existing customer of the bank. Default false.
- inquiries_3: Hard inquiries in last 3 months (if mentioned)
- inquiries_12: Hard inquiries in last 12 months (if mentioned)
- inquiries_24: Hard inquiries in last 24 months (if mentioned)

## Output Format
Return a JSON array of extracted data points. If no valid data points can be extracted (missing required fields or card not in database), return an empty array [].

CRITICAL: Only extract data that is explicitly stated in the post. Do NOT guess or infer values. If credit_score is not mentioned, do not include that data point. If income is not mentioned, omit the listed_income field entirely.

Output raw JSON only, no markdown fences.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`Claude API error: ${response.status} - ${errorText}`);
    return [];
  }

  const data = await response.json();
  const text = data.content[0]?.text || '';

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn(`Failed to parse Claude response: ${err.message}`);
    return [];
  }
}

/**
 * Validate an extracted data point
 */
function validateDataPoint(dp, validCardIds) {
  if (!dp.card_id || !validCardIds.has(dp.card_id)) return null;
  if (typeof dp.result !== 'boolean') return null;
  if (!dp.credit_score || dp.credit_score < 300 || dp.credit_score > 850) return null;

  return {
    card_id: dp.card_id,
    result: dp.result,
    credit_score: dp.credit_score,
    credit_score_source: [0, 1, 2, 3, 4].includes(dp.credit_score_source) ? dp.credit_score_source : 0,
    listed_income: dp.listed_income && dp.listed_income >= 0 && dp.listed_income <= 1000000 ? dp.listed_income : null,
    length_credit: dp.length_credit && dp.length_credit >= 0 && dp.length_credit <= 100 ? dp.length_credit : null,
    starting_credit_limit: dp.result && dp.starting_credit_limit && dp.starting_credit_limit >= 0 ? dp.starting_credit_limit : null,
    bank_customer: dp.bank_customer === true,
    reason_denied: !dp.result ? (dp.reason_denied || null) : null,
    inquiries_3: dp.inquiries_3 >= 0 && dp.inquiries_3 <= 50 ? dp.inquiries_3 : null,
    inquiries_12: dp.inquiries_12 >= 0 && dp.inquiries_12 <= 50 ? dp.inquiries_12 : null,
    inquiries_24: dp.inquiries_24 >= 0 && dp.inquiries_24 <= 50 ? dp.inquiries_24 : null,
  };
}

/**
 * Insert a record into the database with admin_review = 0
 */
async function insertPendingRecord(dp, redditUsername, postUrl, postDate) {
  const result = await mysql.query("INSERT INTO records SET ?", {
    card_id: dp.card_id,
    result: dp.result,
    credit_score: dp.credit_score,
    credit_score_source: dp.credit_score_source,
    listed_income: dp.listed_income,
    date_applied: postDate,
    length_credit: dp.length_credit,
    starting_credit_limit: dp.starting_credit_limit,
    submitter_id: `reddit:u/${redditUsername}`,
    submitter_ip_address: null,
    submit_datetime: new Date(),
    bank_customer: dp.bank_customer,
    reason_denied: dp.reason_denied,
    inquiries_3: dp.inquiries_3,
    inquiries_12: dp.inquiries_12,
    inquiries_24: dp.inquiries_24,
    admin_review: 0,
    source: 'reddit',
    source_url: postUrl,
  });
  return result.insertId;
}

/**
 * Main Lambda handler — triggered by EventBridge schedule
 */
exports.RedditListenerHandler = async (event) => {
  console.log('=== Reddit Listener ===');
  console.log('Event:', JSON.stringify(event));

  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
    console.error('Missing Reddit API credentials');
    return { statusCode: 500, body: 'Missing Reddit credentials' };
  }
  if (!ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY');
    return { statusCode: 500, body: 'Missing Anthropic API key' };
  }

  try {
    // 1. Authenticate with Reddit
    console.log('Authenticating with Reddit...');
    const redditToken = await getRedditToken();

    // 2. Load cards and processed URLs
    console.log('Loading cards and processed URLs...');
    const [cards, processedUrls] = await Promise.all([
      loadCards(),
      getProcessedUrls(),
    ]);
    const validCardIds = new Set(cards.map(c => c.card_id));
    console.log(`Loaded ${cards.length} cards, ${processedUrls.size} processed URLs`);

    // 3. Fetch posts from subreddits
    let allPosts = [];
    for (const sub of SUBREDDITS) {
      console.log(`Fetching posts from r/${sub}...`);
      const posts = await fetchSubredditPosts(redditToken, sub);
      console.log(`  Found ${posts.length} posts`);
      allPosts = allPosts.concat(posts);
    }

    // 4. Filter relevant posts and skip already-processed
    const relevantPosts = filterRelevantPosts(allPosts);
    console.log(`${relevantPosts.length} posts match approval/denial keywords`);

    const newPosts = relevantPosts.filter(post => {
      const url = `https://reddit.com${post.permalink}`;
      return !processedUrls.has(url);
    });
    console.log(`${newPosts.length} posts are new (not yet processed)`);

    if (newPosts.length === 0) {
      console.log('No new posts to process');
      await mysql.end();
      return { statusCode: 200, body: 'No new posts' };
    }

    // 5. Extract data points from each post
    let totalInserted = 0;

    for (const post of newPosts) {
      if (totalInserted >= MAX_INSERTS_PER_RUN) {
        console.log(`Reached max inserts (${MAX_INSERTS_PER_RUN}), stopping`);
        break;
      }

      const postUrl = `https://reddit.com${post.permalink}`;
      const postDate = new Date(post.created_utc * 1000);
      console.log(`\nProcessing: "${post.title}" by u/${post.author}`);

      const dataPoints = await extractDataPoint(post, cards);
      console.log(`  Extracted ${dataPoints.length} potential data point(s)`);

      for (const dp of dataPoints) {
        if (totalInserted >= MAX_INSERTS_PER_RUN) break;

        const validated = validateDataPoint(dp, validCardIds);
        if (!validated) {
          console.log(`  Skipping invalid data point (card_id: ${dp.card_id})`);
          continue;
        }

        // Check for duplicate: same card, source_url, result
        const existing = await mysql.query(
          `SELECT record_id FROM records
           WHERE source = 'reddit' AND source_url = ? AND card_id = ? AND result = ?
           LIMIT 1`,
          [postUrl, validated.card_id, validated.result]
        );

        if (existing.length > 0) {
          console.log(`  Skipping duplicate for card_id ${validated.card_id}`);
          continue;
        }

        const recordId = await insertPendingRecord(validated, post.author, postUrl, postDate);
        console.log(`  Inserted record ${recordId} (card_id: ${validated.card_id}, ${validated.result ? 'approved' : 'denied'})`);
        totalInserted++;
      }

      // Rate limit between Claude API calls
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    await mysql.end();

    console.log(`\n=== Complete: Inserted ${totalInserted} pending record(s) ===`);
    return {
      statusCode: 200,
      body: JSON.stringify({ inserted: totalInserted }),
    };
  } catch (error) {
    console.error('Reddit listener error:', error);
    await mysql.end();
    return {
      statusCode: 500,
      body: `Error: ${error.message}`,
    };
  }
};
