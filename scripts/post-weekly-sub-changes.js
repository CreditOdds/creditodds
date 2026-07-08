#!/usr/bin/env node

/**
 * Weekly Sign-up Bonus Changes Social Post
 *
 * Pulls the past 7 days of `signup_bonus_value` rows from the card wire,
 * collapses each card down to a single net change, groups them into
 * increases / decreases, and queues a text-only post via the Social Posting
 * Service. The service posts `link_url` as a follow-up reply, so the CardWire
 * link lands as the second tweet in the thread.
 *
 * Unlike post-card-wire.js (which fires per-card on a SUB increase to the
 * dedicated @card_wire account), this is a weekly roundup on the main
 * accounts and deliberately reports decreases too — a devaluation is the
 * more newsworthy half of the week.
 *
 * Usage: node scripts/post-weekly-sub-changes.js [--dry-run]
 *
 * Env vars: SOCIAL_API_URL, SOCIAL_API_KEY
 */

const API_BASE = 'https://d2ojrhbh2dincr.cloudfront.net';
const CARD_WIRE_URL = 'https://creditodds.com/card-wire';

// The endpoint caps `limit` at 200 and returns newest-first. A typical week
// carries well under 20 rows, so 200 covers the window with wide margin.
const FETCH_LIMIT = 200;
const WINDOW_DAYS = 7;

// X counts most non-Latin glyphs (our arrows/emoji) as 2 characters. Stay
// under the 280 ceiling with room for a trailing "+N more" line.
const TWEET_MAX = 274;

const HEADER = 'Weekly Sign Up Bonus Changes from CardWire';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, { maxRetries = 3, baseDelay = 2000 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok || (response.status < 500 && response.status !== 429)) {
      return response;
    }
    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`  Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries}, status ${response.status})...`);
      await sleep(delay);
    } else {
      return response;
    }
  }
}

/**
 * Approximates X's weighted character count: code points in the Basic Latin /
 * Latin-1 Supplement blocks weigh 1, everything else (arrows, emoji) weighs 2.
 */
function tweetLength(text) {
  let total = 0;
  for (const ch of text) {
    total += ch.codePointAt(0) <= 0x00ff ? 1 : 2;
  }
  return total;
}

/**
 * Card names carry the issuer suffix in the DB ("... American Express"), which
 * eats scarce tweet budget without adding information next to the card name.
 */
function shortenCardName(name) {
  return String(name)
    .replace(/\s+American Express$/i, '')
    .replace(/\s+Credit Card$/i, '')
    .trim();
}

/**
 * Mirrors the user-facing convention: cash bonuses render as dollars, free
 * nights keep their unit (a bare "2" would be meaningless), and points/miles
 * render as a plain grouped number.
 */
function formatBonus(value, unit) {
  const num = parseFloat(value);
  if (Number.isNaN(num)) return String(value);
  if (unit === 'cash' || unit === 'cashback') return `$${num.toLocaleString('en-US')}`;
  if (unit === 'free_nights') return `${num.toLocaleString('en-US')} night${num === 1 ? '' : 's'}`;
  return num.toLocaleString('en-US');
}

async function fetchRecentSubChanges() {
  // Bust the CloudFront cache (s-maxage=300) so a Thursday run never reads a
  // response written before the morning's card sync.
  const res = await fetchWithRetry(`${API_BASE}/card-wire?limit=${FETCH_LIMIT}&_=${Date.now()}`);
  if (!res.ok) throw new Error(`Failed to fetch card wire: ${res.status}`);
  const { changes } = await res.json();

  if (changes.length >= FETCH_LIMIT) {
    console.log(`  Warning: hit the ${FETCH_LIMIT}-row fetch cap — the oldest changes in the window may be missing.`);
  }

  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return changes.filter(
    c => c.field === 'signup_bonus_value' && new Date(c.changed_at).getTime() >= cutoff
  );
}

/**
 * A card can move more than once in a week (or flip units mid-week). Collapse
 * each card to one net change: oldest old_value -> newest new_value, using
 * only the rows that share the card's most recent unit, since values in
 * different units aren't comparable. Cards that net out flat are dropped.
 */
function collapsePerCard(rows) {
  const byCard = new Map();
  for (const row of rows) {
    if (!byCard.has(row.card_id)) byCard.set(row.card_id, []);
    byCard.get(row.card_id).push(row);
  }

  const collapsed = [];
  for (const cardRows of byCard.values()) {
    cardRows.sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at));

    const latest = cardRows[cardRows.length - 1];
    const sameUnit = cardRows.filter(r => r.unit === latest.unit);
    const first = sameUnit[0];

    const oldNum = parseFloat(first.old_value);
    const newNum = parseFloat(latest.new_value);
    if (Number.isNaN(oldNum) || Number.isNaN(newNum) || oldNum === newNum) continue;

    // A bonus value of 0 means "no publicly-visible offer" (e.g. the amount is
    // sign-in gated), not a literal $0 bonus. Announcing "$10 -> $0" would
    // report a devaluation that never happened, and "0 -> 90,000" would report
    // an increase off a value that was only ever unknown. Suppress both.
    if (oldNum === 0 || newNum === 0) {
      console.log(`  Skipping ${latest.card_name}: ${first.old_value} -> ${latest.new_value} (0 = offer not publicly visible)`);
      continue;
    }

    collapsed.push({
      cardName: shortenCardName(latest.card_name),
      unit: latest.unit,
      oldValue: first.old_value,
      newValue: latest.new_value,
      oldNum,
      newNum,
      // Percent magnitude ranks changes across units (a $50 -> $100 cash bump
      // and a 75k -> 150k points bump both read as +100%).
      magnitude: Math.abs((newNum - oldNum) / oldNum),
      changedAt: latest.changed_at,
    });
  }
  return collapsed;
}

function renderLine(change) {
  const from = formatBonus(change.oldValue, change.unit);
  const to = formatBonus(change.newValue, change.unit);
  return `${change.cardName} ${from} ➡️ ${to}`;
}

/**
 * Fills the tweet greedily, biggest movers first, then reports whatever didn't
 * fit as a "+N more" pointer to the CardWire link in the reply.
 */
function buildPostText(increases, decreases) {
  const sections = [
    { title: '⬆️ Increases', items: increases },
    { title: '⬇️ Decreases', items: decreases },
  ].filter(s => s.items.length > 0);

  const totalItems = increases.length + decreases.length;

  // Start with every section header present, then add lines while they fit.
  const chosen = new Map(sections.map(s => [s.title, []]));
  const render = (moreCount) => {
    const body = sections
      .map(s => {
        const lines = chosen.get(s.title);
        if (lines.length === 0) return null;
        return `${s.title}\n${lines.join('\n')}`;
      })
      .filter(Boolean)
      .join('\n\n');
    const more = moreCount > 0 ? `\n\n+${moreCount} more` : '';
    return `${HEADER}\n\n${body}${more}`;
  };

  // Interleave so a lopsided week still shows both directions: take the next
  // biggest mover from each section in turn.
  const queues = sections.map(s => ({ title: s.title, items: [...s.items] }));
  let shown = 0;
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const q of queues) {
      if (q.items.length === 0) continue;
      const candidate = q.items[0];
      const lines = chosen.get(q.title);
      lines.push(renderLine(candidate));

      const remaining = totalItems - (shown + 1);
      if (tweetLength(render(remaining)) > TWEET_MAX) {
        lines.pop();
        q.items.length = 0; // this section can't fit more
        continue;
      }
      q.items.shift();
      shown++;
      progressed = true;
    }
  }

  return { text: render(totalItems - shown), shown, total: totalItems };
}

function buildLinkUrl() {
  const url = new URL(CARD_WIRE_URL);
  url.searchParams.set('utm_source', 'twitter');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'weekly-sub-changes');
  url.searchParams.set('utm_content', `weekly-${new Date().toISOString().slice(0, 10)}`);
  return url.toString();
}

async function queuePost(textContent, linkUrl, sourceId) {
  const apiUrl = process.env.SOCIAL_API_URL;
  const apiKey = process.env.SOCIAL_API_KEY;
  if (!apiUrl || !apiKey) throw new Error('SOCIAL_API_URL and SOCIAL_API_KEY are required');

  // No `platforms` key: fan out to every connected account (X/@CreditOdds,
  // Facebook, LinkedIn), matching post-weekly-top-cards.js.
  const body = {
    text_content: textContent,
    link_url: linkUrl,
    source_type: 'weekly-sub-changes',
    source_id: sourceId,
  };

  const response = await fetchWithRetry(`${apiUrl}/social/queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Queue API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('=== Weekly Sign-up Bonus Changes ===\n');

  const rows = await fetchRecentSubChanges();
  console.log(`Found ${rows.length} sign-up bonus row(s) in the last ${WINDOW_DAYS} days.`);

  const collapsed = collapsePerCard(rows);
  if (collapsed.length === 0) {
    console.log('No net sign-up bonus changes this week — skipping post.');
    return;
  }

  const byMagnitude = (a, b) => b.magnitude - a.magnitude;
  const increases = collapsed.filter(c => c.newNum > c.oldNum).sort(byMagnitude);
  const decreases = collapsed.filter(c => c.newNum < c.oldNum).sort(byMagnitude);

  console.log(`  ${increases.length} increase(s), ${decreases.length} decrease(s)\n`);
  for (const c of [...increases, ...decreases]) {
    const dir = c.newNum > c.oldNum ? '+' : '-';
    console.log(`  ${dir} ${renderLine(c)}`);
  }

  const { text, shown, total } = buildPostText(increases, decreases);
  const linkUrl = buildLinkUrl();
  const sourceId = `weekly-sub-${new Date().toISOString().slice(0, 10)}`;

  console.log(`\nPost text (${tweetLength(text)} weighted chars, ${shown}/${total} shown):\n`);
  console.log(text);
  console.log(`\nLink (posted as reply): ${linkUrl}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Skipping queue.');
    return;
  }

  console.log('\nQueuing post via Social Posting Service...');
  const result = await queuePost(text, linkUrl, sourceId);
  console.log(`Queued successfully! Post ID: ${result.id}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
