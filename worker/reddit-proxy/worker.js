/**
 * Cloudflare Worker — Reddit JSON proxy for r/churning.
 *
 * Reddit blocks unauthenticated reads from datacenter IPs (AWS/GCP/Azure),
 * which prevents GitHub Actions from fetching subreddit JSON directly. This
 * worker runs on Cloudflare's edge — its IPs are usually accepted — and
 * proxies a narrow set of Reddit GET endpoints behind a shared secret.
 *
 * Deploy:
 *   cd worker/reddit-proxy
 *   npx wrangler login
 *   npx wrangler secret put PROXY_SECRET   # paste a long random string
 *   npx wrangler deploy
 *
 * Use from a client:
 *   GET https://<worker-url>/?path=/r/churning/new.json&limit=25
 *   Headers: Authorization: Bearer <PROXY_SECRET>
 */

const REDDIT_BASE = 'https://www.reddit.com';
const ALLOWED_PATH_PREFIXES = ['/r/churning/'];
const UA = 'web:creditodds-news:v0.1 (by /u/creditodds)';

export default {
  async fetch(request, env) {
    const auth = request.headers.get('authorization') || '';
    const expected = `Bearer ${env.PROXY_SECRET || ''}`;
    if (!env.PROXY_SECRET || auth !== expected) {
      return json({ error: 'unauthorized' }, 401);
    }

    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    if (!path || !path.startsWith('/')) {
      return json({ error: 'missing or invalid path param' }, 400);
    }
    if (!ALLOWED_PATH_PREFIXES.some((p) => path.startsWith(p))) {
      return json({ error: 'path not allowed' }, 403);
    }

    const target = REDDIT_BASE + path;
    let upstream;
    try {
      upstream = await fetch(target, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        cf: { cacheTtl: 60, cacheEverything: false },
      });
    } catch (err) {
      return json({ error: 'upstream fetch failed', detail: String(err) }, 502);
    }

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
