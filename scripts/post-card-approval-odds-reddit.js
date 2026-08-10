#!/usr/bin/env node

/**
 * "<card> approval odds?" — twice-weekly Reddit draft for r/creditodds.
 *
 * Posts one card per run, highest record count first, working down. A card is
 * posted at most ONCE: the rotation does not loop. When every eligible card has
 * had its turn the run is a clean no-op, and the queue refills on its own as
 * cards accumulate data points and cross the record floor.
 *
 * Nothing is auto-published. Like post-weekly-sub-changes-reddit.js, this hands
 * the post to the Social Posting Service targeted at the manual `reddit`
 * platform, which records a pre-filled reddit.com submit URL as
 * `pending_manual`. Maxwell clicks "Post now" in the service UI and submits
 * natively (see the no-self-hosted-Reddit-API constraint).
 *
 * The body uses markdown links, so the composer must be in MARKDOWN mode. The
 * run prints that reminder next to the submit URL.
 *
 * Usage:
 *   node scripts/post-card-approval-odds-reddit.js [--dry-run] [--state <path>]
 *                                                  [--card <slug>] [--min-records <n>]
 *
 * Env vars: SOCIAL_API_URL, SOCIAL_API_KEY (not needed for --dry-run)
 */

const fs = require('fs');
const path = require('path');

const { queueSocialPost } = require('./lib/weekly-sub-changes');
const {
  MIN_RECORDS,
  computeStats,
  selectCard,
  cardPageUrl,
  buildPostText,
  fetchCards,
  fetchCardRecords,
} = require('./lib/card-approval-odds');

const CAMPAIGN = 'card-approval-odds-reddit';
const DEFAULT_STATE_FILE = path.join(__dirname, '..', '.github', 'card-approval-odds-state.json');

function parseArgs(argv) {
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  return {
    dryRun: argv.includes('--dry-run'),
    statePath: flag('--state') || DEFAULT_STATE_FILE,
    cardSlug: flag('--card'),
    minRecords: flag('--min-records') ? Number(flag('--min-records')) : MIN_RECORDS,
  };
}

/**
 * State is a flat list of slugs already posted, plus when. Corrupt or missing
 * state is not fatal, but it IS loud: silently treating it as empty would
 * re-post the whole rotation from the top, so the caller gets a warning.
 */
function loadState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.posted)) {
      console.warn(`WARNING: ${statePath} is not in the expected shape; treating as empty.`);
      return { posted: [] };
    }
    return parsed;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`WARNING: could not read ${statePath} (${err.message}); treating as empty.`);
    }
    return { posted: [] };
  }
}

function saveState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

async function main() {
  const { dryRun, statePath, cardSlug, minRecords } = parseArgs(process.argv.slice(2));

  console.log('=== Card approval odds (Reddit draft) ===\n');
  console.log(`State file: ${statePath}`);

  const state = loadState(statePath);
  const postedSlugs = new Set(state.posted.map(p => p.slug));
  console.log(`${postedSlugs.size} card(s) already posted.`);

  const cards = await fetchCards();
  console.log(`Fetched ${cards.length} cards.`);

  let card;
  if (cardSlug) {
    // Manual override for a re-run or a one-off; still records state so the
    // normal rotation does not repeat it later.
    card = cards.find(c => c.slug === cardSlug);
    if (!card) throw new Error(`No card with slug "${cardSlug}"`);
    console.log(`Card forced via --card: ${card.card_name || card.name}`);
  } else {
    card = selectCard(cards, postedSlugs, { minRecords });
  }

  if (!card) {
    const remaining = cards.filter(c =>
      (c.total_records || 0) >= minRecords && c.accepting_applications !== false
    ).length;
    console.log(
      `\nNo card left to post: all ${remaining} card(s) at or above ${minRecords} records have had their turn.`
    );
    console.log('The rotation does not loop. It resumes when another card crosses the floor.');
    return;
  }

  const name = card.card_name || card.name;
  console.log(`\nSelected: ${name} (${card.total_records} records, slug ${card.slug})`);

  const records = await fetchCardRecords(name);
  const stats = computeStats(records);
  console.log(
    `  ${stats.counted} decided records: ${stats.approvedCount} approved, ${stats.deniedCount} denied`
  );

  // The list endpoint's counts and the per-card records can drift by a few
  // minutes of caching; the floor is re-checked against what will actually be
  // published so a thin post never goes out on a stale count.
  if (stats.counted < minRecords) {
    console.log(
      `\nSkipping: only ${stats.counted} decided record(s) once fetched, below the floor of ${minRecords}.`
    );
    return;
  }

  const link = cardPageUrl(card.slug, CAMPAIGN);
  const text = buildPostText(card, stats, link);
  const dateStamp = new Date().toISOString().slice(0, 10);

  console.log(`\nPost text:\n\n${text}\n`);

  if (dryRun) {
    console.log('[DRY RUN] Not queueing and not recording state.');
    return;
  }

  console.log('Sending to Social Posting Service (publish_now, reddit only)...');
  const result = await queueSocialPost({
    text_content: text,
    source_type: 'card-approval-odds',
    source_id: `approval-odds-${card.slug}`,
    platforms: ['reddit'],
    publish_now: true,
    // Keyed on the card, not the date: a retry on any day must not create a
    // second chore for the same card.
    idempotency_key: `approval-odds-${card.slug}`,
  });

  console.log(`Post #${result.id} status: ${result.status}`);
  const redditResult = (result.results || []).find(r => r.platform === 'reddit');
  if (redditResult?.postUrl) {
    console.log(`\nPre-filled Reddit submit URL (also in the service UI under History):\n${redditResult.postUrl}`);
    console.log(
      '\nIMPORTANT: switch the Reddit composer to Markdown mode before submitting,\n' +
      'or the card links will post as literal [text](url).'
    );
  }
  if (result.status !== 'posted' && !result.deduped) {
    throw new Error(`Expected status 'posted', got '${result.status}' (${JSON.stringify(result.results)})`);
  }

  // Recorded only after a successful queue, so a failed run retries the same
  // card rather than burning it.
  state.posted.push({
    slug: card.slug,
    card_name: name,
    records: stats.counted,
    posted_at: dateStamp,
  });
  saveState(statePath, state);
  console.log(`\nState updated: ${state.posted.length} card(s) posted to date.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
