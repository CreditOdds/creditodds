#!/usr/bin/env node

/**
 * Fetches the most recent r/churning "News and Updates Thread - <date>" and
 * returns its top-level comments (and first-level replies) as structured data.
 *
 * Usage as a module:
 *   const { fetchChurningThread } = require('./fetch-churning-thread');
 *   const thread = await fetchChurningThread();
 *
 * Usage as a CLI (prints summary):
 *   node scripts/fetch-churning-thread.js
 */

const USER_AGENT =
  process.env.REDDIT_USER_AGENT ||
  'web:creditodds-news:v0.1 (by /u/creditodds)';

const PROXY_URL = process.env.REDDIT_PROXY_URL || null;
const PROXY_SECRET = process.env.REDDIT_PROXY_SECRET || null;

const TITLE_PATTERN = /^news and updates thread\b/i;

/**
 * Fetch a Reddit JSON path. If REDDIT_PROXY_URL is set, route through the
 * Cloudflare worker (required from GitHub Actions because Reddit blocks
 * datacenter IPs); otherwise hit www.reddit.com directly (works locally).
 */
async function redditJson(pathWithQuery) {
  if (PROXY_URL) {
    if (!PROXY_SECRET) {
      throw new Error('REDDIT_PROXY_URL is set but REDDIT_PROXY_SECRET is not');
    }
    const proxied = `${PROXY_URL.replace(/\/$/, '')}/?path=${encodeURIComponent(pathWithQuery)}`;
    const res = await fetch(proxied, {
      headers: { Authorization: `Bearer ${PROXY_SECRET}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Reddit proxy ${proxied} -> ${res.status} ${res.statusText}`);
    }
    return res.json();
  }
  const direct = `https://www.reddit.com${pathWithQuery}`;
  const res = await fetch(direct, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Reddit fetch ${direct} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function formatThreadDate(d) {
  // Thread titles use long month + un-padded day, e.g. "April 12, 2026".
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

/**
 * Find the r/churning "News and Updates Thread" for a given date.
 * @param {Date} [targetDate] - defaults to yesterday in ET. Today's thread is
 *   usually too sparse since it was just posted; yesterday's is settled.
 */
async function findLatestNewsThread(targetDate) {
  if (!targetDate) {
    targetDate = new Date();
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  }
  const wantedDateStr = formatThreadDate(targetDate);
  const wantedTitle = `news and updates thread - ${wantedDateStr.toLowerCase()}`;

  const data = await redditJson('/r/churning/new.json?limit=25');
  const posts = (data?.data?.children || []).map((c) => c.data);

  // Prefer exact date match; fall back to most recent News and Updates Thread.
  const exact = posts.find((p) => (p.title || '').toLowerCase() === wantedTitle);
  const match = exact || posts.find((p) => TITLE_PATTERN.test(p.title || ''));
  if (!match) {
    throw new Error(
      `No "News and Updates Thread" found in /r/churning/new (looked for "${wantedDateStr}")`
    );
  }
  return {
    id: match.id,
    title: match.title,
    permalink: `https://www.reddit.com${match.permalink}`,
    createdUtc: match.created_utc,
  };
}

function flattenComments(children, parentId = null, depth = 0, acc = []) {
  for (const child of children || []) {
    if (child.kind !== 't1') continue;
    const c = child.data;
    if (!c || !c.body) continue;
    acc.push({
      id: c.id,
      parentId,
      depth,
      author: c.author,
      body: c.body,
      score: c.score ?? 0,
      createdUtc: c.created_utc,
      permalink: `https://www.reddit.com${c.permalink}`,
      isSubmitter: !!c.is_submitter,
    });
    const replies = c.replies?.data?.children;
    if (replies && depth < 1) {
      flattenComments(replies, c.id, depth + 1, acc);
    }
  }
  return acc;
}

async function fetchChurningThread(opts = {}) {
  const thread = await findLatestNewsThread(opts.targetDate);
  const commentsJson = await redditJson(
    `/r/churning/comments/${thread.id}.json?limit=500&raw_json=1&sort=top`
  );
  const commentsTree = commentsJson?.[1]?.data?.children || [];
  const comments = flattenComments(commentsTree);

  return {
    threadId: thread.id,
    threadTitle: thread.title,
    threadUrl: thread.permalink,
    threadCreatedUtc: thread.createdUtc,
    comments,
  };
}

async function main() {
  const t = await fetchChurningThread();
  console.log(`Thread: ${t.threadTitle}`);
  console.log(`URL:    ${t.threadUrl}`);
  console.log(`Comments fetched: ${t.comments.length}`);
  const topLevel = t.comments.filter((c) => c.depth === 0);
  console.log(`Top-level: ${topLevel.length}`);
  console.log(`Median score (top-level): ${median(topLevel.map((c) => c.score))}`);
  console.log('\nTop 5 by score:');
  topLevel
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .forEach((c) => {
      console.log(`  [${c.score}] ${c.body.replace(/\s+/g, ' ').slice(0, 140)}`);
    });
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}

module.exports = { fetchChurningThread, _redditJson: redditJson };
