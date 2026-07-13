#!/usr/bin/env node

/**
 * Weekly Sign-up Bonus Changes — Reddit draft for r/creditodds
 *
 * Monday counterpart to post-weekly-sub-changes.js (which tweets a truncated
 * roundup on Thursdays). Reddit has no length pressure, so this renders the
 * FULL week of net changes and sends it to the Social Posting Service
 * targeted at the manual `reddit` platform.
 *
 * Nothing is auto-published to Reddit: the service's reddit module just
 * records a pre-filled reddit.com submit URL as a `pending_manual` result.
 * The post shows up in the service UI with a "Post now" link that opens
 * Reddit's composer with title and body already filled in.
 *
 * `publish_now: true` runs that synchronously, so this works even while the
 * service's scheduler rule is disabled.
 *
 * The first line of text_content becomes the Reddit title (the service's
 * reddit module splits on the first newline); the rest is the selftext body.
 *
 * Usage: node scripts/post-weekly-sub-changes-reddit.js [--dry-run]
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

/**
 * With no card-name column label next to it, a bare "75,000" is ambiguous, so
 * points and miles spell out their unit (dollars and free nights already
 * carry theirs).
 */
function formatBonusWithUnit(value, unit) {
  const base = formatBonus(value, unit);
  if (unit === 'points') return `${base} points`;
  if (unit === 'miles') return `${base} miles`;
  return base;
}

/**
 * Deliberately markdown-free: Reddit's submit page opens in the rich-text
 * editor, which takes the pre-filled text literally — `**` and `|` table
 * syntax would post as visible asterisks and pipes. Plain lines read
 * correctly in both the rich-text and markdown editors.
 */
function renderLines(changes) {
  return changes
    .map(c => `${c.cardName}: ${formatBonusWithUnit(c.oldValue, c.unit)} → ${formatBonusWithUnit(c.newValue, c.unit)}`)
    .join('\n');
}

function formatShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * First line is the Reddit title; the service appends the CardWire link to
 * the body, so the body's closing line introduces it.
 */
function buildPostText(increases, decreases) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const title = `Weekly Sign Up Bonus Changes (${formatShortDate(windowStart)} to ${formatShortDate(now)})`;

  const sections = [];
  if (increases.length > 0) {
    sections.push(`Increases:\n\n${renderLines(increases)}`);
  }
  if (decreases.length > 0) {
    sections.push(`Decreases:\n\n${renderLines(decreases)}`);
  }
  sections.push(
    'Values are the publicly visible offers we track. Full change history on CardWire:'
  );

  return `${title}\n\n${sections.join('\n\n')}`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('=== Weekly Sign-up Bonus Changes (Reddit) ===\n');

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
  console.log(`  ${increases.length} increase(s), ${decreases.length} decrease(s)`);

  const text = buildPostText(increases, decreases);
  // utm_source gets rewritten to the platform name at publish time anyway;
  // set it to reddit so a dry-run prints the real link.
  const linkUrl = buildCardWireLink('reddit', 'weekly-sub-changes-reddit');
  const dateStamp = new Date().toISOString().slice(0, 10);

  console.log(`\nPost text:\n\n${text}`);
  console.log(`\nLink (appended to body): ${linkUrl}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Skipping queue.');
    return;
  }

  console.log('\nSending to Social Posting Service (publish_now, reddit only)...');
  const result = await queueSocialPost({
    text_content: text,
    link_url: linkUrl,
    source_type: 'weekly-sub-changes',
    source_id: `weekly-sub-reddit-${dateStamp}`,
    platforms: ['reddit'],
    publish_now: true,
    // A rerun on the same day (workflow retry, manual dispatch) must not
    // create a second pending-manual chore in the UI.
    idempotency_key: `weekly-sub-reddit-${dateStamp}`,
  });

  console.log(`Post #${result.id} status: ${result.status}`);
  const redditResult = (result.results || []).find(r => r.platform === 'reddit');
  if (redditResult?.postUrl) {
    console.log(`\nPre-filled Reddit submit URL (also in the service UI under History):\n${redditResult.postUrl}`);
  }
  if (result.status !== 'posted' && !result.deduped) {
    throw new Error(`Expected status 'posted', got '${result.status}' (${JSON.stringify(result.results)})`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
