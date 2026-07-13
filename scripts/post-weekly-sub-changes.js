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

const {
  WINDOW_DAYS,
  formatBonus,
  fetchRecentSubChanges,
  collapsePerCard,
  buildCardWireLink,
  queueSocialPost,
} = require('./lib/weekly-sub-changes');

// X counts most non-Latin glyphs (our arrows/emoji) as 2 characters. Stay
// under the 280 ceiling with room for a trailing "+N more" line.
const TWEET_MAX = 274;

const HEADER = 'Weekly Sign Up Bonus Changes from CardWire';

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

function renderLine(change) {
  const from = formatBonus(change.oldValue, change.unit);
  const to = formatBonus(change.newValue, change.unit);
  return `${change.cardName} ${from} ➡️ ${to}`;
}

/**
 * Fills the tweet greedily, most valuable movers first, then reports whatever
 * didn't fit as a "+N more" pointer to the CardWire link in the reply.
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

async function queuePost(textContent, linkUrl, sourceId) {
  // No `platforms` key: fan out to every connected account (X/@CreditOdds,
  // Facebook, LinkedIn), matching post-weekly-top-cards.js.
  return queueSocialPost({
    text_content: textContent,
    link_url: linkUrl,
    source_type: 'weekly-sub-changes',
    source_id: sourceId,
  });
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

  const byWeight = (a, b) => b.weight - a.weight;
  const increases = collapsed.filter(c => c.newNum > c.oldNum).sort(byWeight);
  const decreases = collapsed.filter(c => c.newNum < c.oldNum).sort(byWeight);

  console.log(`  ${increases.length} increase(s), ${decreases.length} decrease(s)\n`);
  for (const c of [...increases, ...decreases]) {
    const dir = c.newNum > c.oldNum ? '+' : '-';
    console.log(`  ${dir} ${renderLine(c)}`);
  }

  const { text, shown, total } = buildPostText(increases, decreases);
  const linkUrl = buildCardWireLink('twitter', 'weekly-sub-changes');
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
