/**
 * Queue an original post via the social-posting-service (same contract as
 * queue-social.js: text_content / link_url / source_type / source_id, x-api-key).
 * Routing through the service gets us the blackout window, scheduling, and the
 * X + Facebook fanout for free.
 */

async function queueTweet({ text, sourceId, linkUrl }) {
  const apiUrl = process.env.SOCIAL_API_URL;
  const apiKey = process.env.SOCIAL_API_KEY;
  if (!apiUrl || !apiKey) throw new Error('SOCIAL_API_URL and SOCIAL_API_KEY are required');

  const body = {
    text_content: text,
    link_url: linkUrl,
    source_type: 'content-agent',
    source_id: sourceId,
    // Content-agent items are tweets only. Without this the service fans out to
    // every active platform (Facebook included) — these quick takes are X-native
    // and shouldn't hit FB unless they graduate to a full article.
    platforms: ['twitter'],
  };

  const res = await fetch(`${apiUrl}/social/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Queue API error: ${res.status} - ${t}`);
  }
  return res.json();
}

function buildLinkUrl(sourceId) {
  const params = new URLSearchParams({
    utm_source: 'twitter',
    utm_medium: 'social',
    utm_campaign: 'content-agent',
    utm_content: sourceId,
  });
  // Generic destination until we can map topics to specific pages; the tweet text
  // itself carries the value.
  return `https://creditodds.com/news?${params}`;
}

module.exports = { queueTweet, buildLinkUrl };
