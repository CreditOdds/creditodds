/**
 * Web search + lightweight page fetch for fact-checking. Reuses the Brave Search
 * pattern from auto-news-update.js (BRAVE_SEARCH_API_KEY).
 */

async function braveSearch(query, { count = 8, freshness } = {}) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error('BRAVE_SEARCH_API_KEY is required');

  const params = new URLSearchParams({
    q: query,
    count: String(count),
    text_decorations: 'false',
  });
  if (freshness) params.set('freshness', freshness);

  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    });
    if (res.status !== 429) break;
    // Rate-limited — back off and retry.
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  if (!res.ok) throw new Error(`Brave Search error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return (data.web?.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    description: r.description || '',
    age: r.age || null,
  }));
}

// Domains we treat as first-party / primary (issuers, networks, official).
const PRIMARY_DOMAINS = [
  'americanexpress.com', 'chase.com', 'capitalone.com', 'discover.com',
  'citi.com', 'citibank.com', 'bankofamerica.com', 'wellsfargo.com',
  'usbank.com', 'barclaycardus.com', 'synchrony.com', 'bilt.com',
  'visa.com', 'mastercard.com',
];

function isPrimarySource(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return PRIMARY_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

module.exports = { braveSearch, isPrimarySource, PRIMARY_DOMAINS };
