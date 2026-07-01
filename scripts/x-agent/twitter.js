/**
 * X/Twitter I/O for the reply agent: search recent tweets from target accounts,
 * and post replies. Uses the existing OAuth 1.0a user-context keys (the same four
 * TWITTER_* secrets post-social.js uses) — those work for both search and posting
 * on the Basic tier, so no new bearer secret is needed.
 */

const { TwitterApi } = require('twitter-api-v2');

function getClient() {
  const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET } = process.env;
  if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_TOKEN_SECRET) {
    throw new Error('Twitter credentials not set (need TWITTER_API_KEY/SECRET/ACCESS_TOKEN/ACCESS_TOKEN_SECRET)');
  }
  return new TwitterApi({
    appKey: TWITTER_API_KEY,
    appSecret: TWITTER_API_SECRET,
    accessToken: TWITTER_ACCESS_TOKEN,
    accessSecret: TWITTER_ACCESS_TOKEN_SECRET,
  });
}

/**
 * Build a single search/recent query for a set of handles. One query for all
 * handles is far more read-efficient than polling each timeline separately.
 * Excludes retweets and replies so we only see their original posts.
 */
function buildQuery(handles) {
  const from = handles.map((h) => `from:${h}`).join(' OR ');
  return `(${from}) -is:retweet -is:reply lang:en`;
}

/**
 * Search recent tweets from the given handles.
 * @returns {Promise<{tweets: Array<{id,author,text,createdAt,metrics}>, newestId: string|null}>}
 */
async function searchRecent(handles, { sinceId, maxResults = 30 } = {}) {
  if (!handles.length) return { tweets: [], newestId: sinceId || null };
  const client = getClient();

  const params = {
    query: buildQuery(handles),
    max_results: Math.min(Math.max(maxResults, 10), 100),
    'tweet.fields': 'created_at,author_id,public_metrics',
    expansions: 'author_id',
    'user.fields': 'username',
  };
  if (sinceId) params.since_id = sinceId;

  const res = await client.v2.get('tweets/search/recent', params);
  const users = new Map((res.includes?.users || []).map((u) => [u.id, u.username]));
  const rows = res.data || [];

  const tweets = rows.map((t) => ({
    id: t.id,
    author: users.get(t.author_id) || t.author_id,
    text: t.text,
    createdAt: t.created_at,
    metrics: t.public_metrics || null,
  }));

  const newestId = res.meta?.newest_id || (tweets[0] && tweets[0].id) || sinceId || null;
  return { tweets, newestId };
}

/**
 * Post a reply to a given tweet. Returns the new tweet id.
 */
async function postReply(text, inReplyToTweetId) {
  const client = getClient();
  const { data } = await client.v2.reply(text, inReplyToTweetId);
  return data.id;
}

/**
 * Fetch public metrics for a set of tweet ids (best effort — used by the digest).
 */
async function getMetrics(ids) {
  if (!ids.length) return {};
  const client = getClient();
  const out = {};
  // API allows up to 100 ids per lookup.
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const res = await client.v2.get('tweets', {
      ids: batch.join(','),
      'tweet.fields': 'public_metrics',
    });
    for (const t of res.data || []) out[t.id] = t.public_metrics || null;
  }
  return out;
}

module.exports = { searchRecent, postReply, getMetrics, buildQuery };
