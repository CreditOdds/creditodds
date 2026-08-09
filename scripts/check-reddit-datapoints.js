#!/usr/bin/env node

/**
 * Check Reddit Data Points — local, daily approval/denial data-point discovery.
 *
 * Sibling of check-card-news.js (same fetch/finish split, same Reddit access
 * constraints): everything exact (feed fetching, seen-state dedupe, schema
 * validation, YAML writing, PR-body assembly) stays in this script; the model
 * work (reading candidate posts and extracting structured data points) happens
 * in the Claude Code session between the two phases. No LLM API keys here.
 *
 * Phases:
 *   --phase=fetch   Pull candidate posts from r/CreditCards (new posts with
 *                   approval/denial signals, plus the current approval/data-
 *                   point megathread's comments when one exists). For the most
 *                   promising posts, also pull that post's comment feed and
 *                   attach the OP's own replies — posters routinely leave the
 *                   score or the outcome in a reply rather than the body, and
 *                   the session cannot fetch Reddit itself (WebFetch is blocked
 *                   for reddit.com), so it has to arrive here. Drop anything
 *                   already recorded in .github/reddit-datapoint-state.json,
 *                   then write one self-contained extraction prompt to
 *                   .reddit-dp-work/extract-prompt.md.
 *
 *                   Also re-presents the pending bucket (below): posts that
 *                   carried a real outcome but were missing one required field.
 *
 *   (session)       Reads the extraction prompt, writes one YAML per data
 *                   point to .reddit-dp-work/proposed/<n>.yaml, and one YAML
 *                   per near-miss to .reddit-dp-work/pending/<n>.yaml.
 *
 *   --phase=finish  Validate every proposed data point (field ranges mirror
 *                   the /records POST schema in apps/api, card_name must match
 *                   the catalog, source_id must be one of this run's
 *                   candidates), move survivors into data/reddit-datapoints/,
 *                   write the PR review table to .reddit-dp-work/pr-body.md,
 *                   and stage the updated seen-state at
 *                   .reddit-dp-work/state-updated.json.
 *
 * The pending bucket ("incomplete revisit"): precision-over-recall means a post
 * reporting a real, first-person, catalog-card outcome still gets dropped when
 * one required field is missing — most often the credit score. Those are the
 * most recoverable misses we have, because the number frequently shows up in a
 * reply hours after we read the post, by which time the seen-state has already
 * retired it. So instead of dropping them the session declares them pending,
 * and the next few fetch runs re-read the post's comment feed to see whether the
 * OP filled the gap in. Unresolved entries also land in
 * .reddit-dp-work/followups.md, which is the list to go ask about by hand.
 *
 * Publishing (branch + PR + state push) is scripts/check-reddit-datapoints-publish.sh.
 * Merging the PR triggers .github/workflows/sync-datapoints.yml, which imports
 * the accepted rows into the records table via the
 * creditodds-import-reddit-records Lambda.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const REPO_ROOT = path.join(__dirname, '..');
const WORK_DIR = path.join(REPO_ROOT, '.reddit-dp-work');
const PROPOSED_DIR = path.join(WORK_DIR, 'proposed');
const PENDING_DIR = path.join(WORK_DIR, 'pending');
const PROMPT_FILE = path.join(WORK_DIR, 'extract-prompt.md');
const SKIPPED_FILE = path.join(WORK_DIR, 'skipped.yaml');
const CANDIDATES_FILE = path.join(WORK_DIR, 'candidates.json');
const STATE_UPDATED_FILE = path.join(WORK_DIR, 'state-updated.json');
const PR_BODY_FILE = path.join(WORK_DIR, 'pr-body.md');
const FOLLOWUPS_FILE = path.join(WORK_DIR, 'followups.md');
const DATAPOINTS_DIR = path.join(REPO_ROOT, 'data', 'reddit-datapoints');
const CARDS_DIR = path.join(REPO_ROOT, 'data', 'cards');
const STATE_FILE = path.join(REPO_ROOT, '.github', 'reddit-datapoint-state.json');

const TODAY = new Date().toISOString().slice(0, 10);
const THIS_MONTH = TODAY.slice(0, 7);

// Keep seen-ids for 180 days: posts age out of the /new feed within days and a
// megathread's comment ids stop recurring once the thread is unpinned, so this
// is generous while keeping the state file bounded.
const STATE_RETENTION_DAYS = 180;

// How far back a data point's application may be. Was 12 months, on the theory
// that older applications are too stale to say anything about today's odds.
// Widened to 6 years (Max, 2026-07-30) because historical backfills are worth
// more than that theory: the daily routine only ever sees the last few days, so
// a narrow window silently discarded every historical sweep.
//
// Worth knowing when reading the odds: refresh-card-stats.js aggregates every
// record with admin_review = 1 AND active = 1 and applies NO date filter or
// recency weighting, so a six-year-old row counts exactly as much as one from
// last week in both the approval rate and the median score/income/history.
const MAX_DATA_POINT_AGE_MONTHS = 72;

// Widest credit-score range we will accept, recording its lower bound. Posters
// write "753-758" constantly and the old rule threw every one away: in a single
// 8-candidate pass on 2026-07-30 that cost six data points, more than the pass
// produced. A spread this narrow is smaller than the month-to-month drift in a
// real score, and we already accept "about 750" as a point value.
//
// Deliberately narrow. At "736-770ish" or "580-600" the lower bound stops being
// a bound and becomes a guess, so those still get skipped.
const MAX_SCORE_RANGE_SPREAD = 20;

// How long a pending near-miss keeps costing us requests before we give up on
// it. Both bounds are deliberately short: a Reddit post stops accumulating
// comments within a couple of days, so a score that has not appeared by the
// third look is not going to appear on the tenth, and every revisit is one more
// unauthenticated request against a feed that already throttles us daily.
const PENDING_MAX_DAYS = 7;
const PENDING_MAX_ATTEMPTS = 3;

// Fields a pending entry may claim to be missing. Anything the extraction rules
// treat as required to publish a row, plus card_name for the case where the
// outcome is unambiguous but which card it was is not.
const PENDING_MISSING_FIELDS = ['credit_score', 'card_name', 'date_applied', 'result'];

// Why a candidate produced no data point.
//
// Until this existed the run reported "15 candidates, 1 data point" and nothing
// about the other 14: they were presented, judged, marked seen, and forgotten,
// with no way to tell a correctly-strict extractor from a broken one. That
// mattered because both look identical from outside, and the loss is permanent
// (seen-state retires every candidate presented, published or not).
//
// A fixed vocabulary rather than free text, because the point is to aggregate
// across runs. "We dropped 14" is noise; "11 were odds questions, 3 had no
// score" is a decision about where the next fix goes. `other` exists so an
// unforeseen case is not forced into a wrong bucket, and it demands a note.
const SKIP_REASONS = {
  no_outcome: 'No stated approval or denial (odds question, recommendation request, chatter)',
  pre_qual: 'Pre-qualification or pre-approval result, which is never an outcome',
  not_first_person: "Someone else's application, or second-hand with no details",
  no_score: 'Real outcome but no credit score anywhere, and below the pending bar',
  score_too_vague: 'Score only as a wide range, a floor, or a description ("mid 700s")',
  card_not_in_catalog: 'Real outcome and score, but the card is not in data/cards/',
  card_unclear: 'Real outcome but which card was applied for cannot be pinned down',
  not_datable: 'Application cannot be placed in a specific month',
  too_old: `Application predates the ${MAX_DATA_POINT_AGE_MONTHS / 12}-year window`,
  duplicate: 'Same application already recorded',
  other: 'Anything else (a note is required)',
};

// Reasons that carry an extra required field, because the reason is only
// actionable with it. A catalog gap is worth nothing without the card's name —
// that list is the whole reason Max asked for this.
const SKIP_REQUIRES_CARD = ['card_not_in_catalog'];
const SKIP_REQUIRES_NOTE = ['other'];

// How many past runs to keep in the state file. Enough to see a month-plus
// trend in yield and skip mix without the committed file growing without bound.
const RUN_LOG_LIMIT = 60;

/**
 * How many pages of /new to walk, and why this exists.
 *
 * The routine reads `/new` once a day and used to stop at the first 100 posts.
 * r/CreditCards posts well past 100 a day, so a single page could not cover a
 * day of the sub no matter how good the extractor was: everything below the
 * newest 100 was never fetched, never a candidate, and never counted as a miss.
 * That was a hard ceiling on recall sitting above every other tuning knob —
 * roughly 9 to 22 candidates surfaced per day out of a whole day's posting.
 *
 * Reddit's listing endpoints take an `after` cursor, and .rss honours it like
 * any other listing renderer, so one run can walk several pages back instead of
 * sampling the top. Four pages covers ~400 posts, comfortably more than a day.
 * The cost is 3 extra requests at CAPS.requestSpacingMs apart, which is far
 * cheaper than the comment expansion the same run already does.
 *
 * Paging stops early (see fetchNewPosts) once a page yields nothing we have not
 * already seen, so on a normal day the seen-state cuts this short by itself and
 * only a backlog actually pays for all four pages.
 */
const NEW_FEED_PAGES = 4;

const CAPS = {
  // Raised from 40/60 when /new started paging (NEW_FEED_PAGES). One page could
  // never produce more than a handful of signal-matching posts, so the old caps
  // were slack that never bound; against four pages they would silently become
  // the new ceiling, which is the exact failure this change exists to remove.
  // Both are reported when they truncate — see phaseFetch.
  newPosts: 60,
  threadComments: 60,
  bodyChars: 2500,
  totalCandidates: 80,
  // OP-reply expansion. Each expanded post costs one extra Reddit request at 8s
  // spacing, so the cap is what bounds the fetch phase's runtime (and our rate
  // of unauthenticated requests) more than anything else.
  expandPosts: 8,
  // Total comment-feed requests per run, shared between pending revisits and
  // fresh OP expansion. Revisits draw from it first (they target a known
  // outcome missing one field, so they are the higher-value request), and
  // whatever is left goes to speculative expansion of today's posts. Without a
  // shared ceiling the two loops would each spend `expandPosts` and double our
  // request rate against a feed that already 429s most days.
  replyRequests: 8,
  revisitPosts: 4,
  opCommentsPerPost: 5,
  opCommentChars: 600,
  abortAfterFailures: 2,
  // Separate and slightly looser than the failure cap: a throttled request
  // still returns its data, so it is worth absorbing a couple before quitting.
  // Bounds backoff cost at roughly 3 minutes.
  abortAfterThrottled: 3,
  // Timings, named so the tests can shrink them — otherwise every case that
  // exercises the retry or the request loop would sit through the real waits.
  requestSpacingMs: 8000,
  rateLimitBackoffMs: 61000,
};

// Mirrors REASON_DENIED_CODES in apps/api/src/handlers/user-records.js.
const REASON_DENIED_CODES = [
  'too_many_inquiries',
  'too_many_recent_accounts',
  'length_of_credit_too_short',
  'too_few_accounts',
  'credit_score_too_low',
  'high_utilization',
  'too_much_credit_with_issuer',
  'no_issuer_relationship',
  'income_too_low',
  'recent_delinquency',
  'bankruptcy_or_public_record',
  'other',
  'not_specified',
];

// ── Catalog / state loaders ──────────────────────────────────────────────────

// Card names come straight from data/cards/*.yaml (not data/cards.json, which
// is chronically stale locally). previous_names are kept as aliases so a DP
// citing a rebranded card still matches, but always canonicalize to `name`.
function loadCardCatalog() {
  const files = fs.readdirSync(CARDS_DIR).filter((f) => /\.ya?ml$/.test(f));
  const cards = [];
  for (const file of files) {
    try {
      const c = yaml.load(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
      if (c && c.name) {
        cards.push({
          name: c.name,
          bank: c.bank || '',
          slug: c.slug || '',
          previous_names: Array.isArray(c.previous_names) ? c.previous_names : [],
        });
      }
    } catch (err) {
      console.warn(`  Warning: could not parse ${file}: ${err.message}`);
    }
  }
  return cards;
}

function loadState() {
  const empty = { seen: {}, pending: {}, runs: [] };
  try {
    if (!fs.existsSync(STATE_FILE)) return empty;
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!parsed || typeof parsed.seen !== 'object') return empty;
    // `pending` and `runs` both postdate `seen`; a state file written before
    // either existed is valid and just has an empty bucket.
    return {
      seen: parsed.seen,
      pending: parsed.pending && typeof parsed.pending === 'object' ? parsed.pending : {},
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    };
  } catch {
    return empty;
  }
}

// ── Pending near-misses ──────────────────────────────────────────────────────

function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);
}

// Why an entry is done being chased, or null while it is still worth a look.
// Returns the reason so the fetch phase can say what it gave up on rather than
// dropping it silently, which reads exactly like "there was nothing there".
function pendingExpiry(entry, today = TODAY) {
  if (!entry || typeof entry !== 'object') return 'malformed entry';
  if ((entry.attempts || 0) >= PENDING_MAX_ATTEMPTS) {
    return `no answer after ${entry.attempts} revisit(s)`;
  }
  const age = entry.firstSeen ? daysBetween(entry.firstSeen, today) : 0;
  if (age > PENDING_MAX_DAYS) return `${age} days old, past the ${PENDING_MAX_DAYS}-day window`;
  return null;
}

// Oldest and least-tried first: an entry on its last attempt is the one about to
// age out, and a post loses its chance of new comments as it ages.
function rankPending(pending) {
  return Object.entries(pending)
    .map(([id, entry]) => ({ id, entry }))
    .sort(
      (a, b) =>
        (a.entry.attempts || 0) - (b.entry.attempts || 0) ||
        String(a.entry.firstSeen || '').localeCompare(String(b.entry.firstSeen || ''))
    );
}

// Every data point already sitting in data/reddit-datapoints/ (accepted + merged).
function loadImportedDataPoints() {
  if (!fs.existsSync(DATAPOINTS_DIR)) return [];
  const rows = [];
  for (const file of fs.readdirSync(DATAPOINTS_DIR).filter((f) => /\.ya?ml$/.test(f))) {
    try {
      const dp = yaml.load(fs.readFileSync(path.join(DATAPOINTS_DIR, file), 'utf8'));
      if (dp && dp.source_id) rows.push(dp);
    } catch {
      /* unparseable committed files are caught in review, not here */
    }
  }
  return rows;
}

// source_ids already sitting in data/reddit-datapoints/ (accepted + merged).
function loadImportedSourceIds() {
  return new Set(loadImportedDataPoints().map((dp) => String(dp.source_id).replace(/#\d+$/, '')));
}

// ── Cross-post duplicate detection ───────────────────────────────────────────
//
// source_id dedupe only catches the same POST twice. It cannot catch the same
// APPLICATION written up in two different posts, which is common and gets more
// common the harder we sweep: the same person posts "denied, what now?" and then
// "here's my DP" ten days later, and a backfill querying by flair and then by
// 199 card names hits both. Seen live on 2026-07-30 — one Blue Cash Everyday
// denial at 644 Experian appeared as t3_1unbuu8 and t3_1uei5qj.
//
// Nothing downstream would catch it either: the import Lambda dedupes on
// submitter_id, which is derived from source_id, so both rows insert and the
// card's approval rate quietly counts one person twice.

// Fields that would differ between two genuinely different people who happen to
// share a card, outcome, score and month. Where BOTH rows carry one of these and
// the values disagree, they are different applications.
const DISTINGUISHING_FIELDS = ['listed_income', 'starting_credit_limit', 'total_open_cards', 'length_credit'];

function monthsBetween(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return Math.abs((ay - by) * 12 + (am - bm));
}

/**
 * Does `dp` look like the same application as `other`, reported separately?
 *
 * Requires card, result and exact score to match, and the application month to
 * be within one (people misremember whether they applied in late June or early
 * July). Then: if any distinguishing field disagrees, they are different people
 * and this is a coincidence, not a duplicate.
 */
function looksLikeSameApplication(dp, other) {
  if (dp.card_name !== other.card_name) return false;
  if (dp.result !== other.result) return false;
  if (dp.credit_score !== other.credit_score) return false;
  if (!dp.date_applied || !other.date_applied) return false;
  if (monthsBetween(dp.date_applied, other.date_applied) > 1) return false;
  for (const field of DISTINGUISHING_FIELDS) {
    const a = dp[field];
    const b = other[field];
    if (a != null && b != null && a !== b) return false;
  }
  return true;
}

// ── Reddit fetching (same constraints as check-card-news.js: Atom only,
// browser UA, 8s spacing, one 61s backoff on 429) ────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Count of 61s backoffs taken. A 429 that succeeds on retry is not a failure —
// the caller gets its data and never knows — but it still costs a minute, so
// throttling has to be observable to anything that loops over requests.
let rateLimitBackoffs = 0;
const getRateLimitBackoffs = () => rateLimitBackoffs;

async function redditRss(url, { retried = false } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/atom+xml,application/xml,text/xml,*/*' },
  });
  if (res.status === 429 && !retried) {
    console.warn(`  Reddit 429 on ${url} — backing off ${Math.round(CAPS.rateLimitBackoffMs / 1000)}s and retrying once`);
    rateLimitBackoffs++;
    await sleep(CAPS.rateLimitBackoffMs);
    return redditRss(url, { retried: true });
  }
  if (!res.ok) throw new Error(`Reddit RSS ${url} -> ${res.status}`);
  return res.text();
}

function unescapeEntities(text) {
  return (text || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Parse a Reddit Atom feed into {id, title, link, content, updated, author}.
 * Unlike the news parser this keeps the entry <id> (the t3_/t1_ fullname —
 * our dedupe key), <updated> (the DP's default application month), and the
 * <author> name (how OP replies are told apart from everyone else's).
 */
function parseAtom(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const e = match[1];
    const rawId = e.match(/<id>([\s\S]*?)<\/id>/)?.[1] || '';
    const id = rawId.match(/(t[13]_[a-z0-9]+)/i)?.[1]?.toLowerCase() || '';
    const title = unescapeEntities(e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').trim();
    const link = e.match(/<link[^>]*href="([^"]+)"/)?.[1] || '';
    const updated = e.match(/<updated>([\s\S]*?)<\/updated>/)?.[1]?.slice(0, 10) || '';
    const author = unescapeEntities(e.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/)?.[1] || '')
      .trim()
      .replace(/^\/u\//, '');
    const rawContent = e.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || '';
    // Content is XML-escaped HTML: unescape to HTML, strip tags, unescape again.
    const content = unescapeEntities(unescapeEntities(rawContent).replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (id && (title || content)) {
      entries.push({ id, title, link: unescapeEntities(link), content, updated, author });
    }
  }
  return entries;
}

function truncate(text, max) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

// Loose recall filter — the extraction prompt is the precision gate. Question
// posts ("what are my odds?") survive this regex on purpose: their comment
// sections sometimes contain the OP's eventual outcome, and the model skips
// anything without a stated result anyway.
const DP_SIGNAL_RE = /(approv|deni(ed|al)|data ?point|\bdp\b|instant.{0,12}(approval|decision)|got (the card|approved|denied)|rejected)/i;

/**
 * Walk /new back through NEW_FEED_PAGES pages, newest first.
 *
 * Three properties worth keeping if this is ever edited:
 *
 * 1. Only page 1 is allowed to fail the source. A 429 on page 3 returns the two
 *    pages we already have rather than throwing away a successful crawl —
 *    partial coverage beats none, and the run's source count still reports it.
 * 2. Paging stops as soon as a page contains nothing unseen. That is the signal
 *    we have reached where yesterday's run finished, and everything below is
 *    already in the seen-state.
 * 3. Dedupe is by post id across pages, because a post submitted while we page
 *    shifts the window and can repeat on the next page.
 */
async function fetchNewPosts(seenIds) {
  const collected = [];
  const idsThisCrawl = new Set();
  let after = null;
  let pages = 0;

  for (let page = 0; page < NEW_FEED_PAGES; page++) {
    const url =
      `https://www.reddit.com/r/CreditCards/new/.rss?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`;
    let entries;
    try {
      if (page > 0) await sleep(CAPS.requestSpacingMs);
      entries = parseAtom(await redditRss(url));
    } catch (err) {
      if (page === 0) throw err;
      console.warn(`  /new page ${page + 1} failed (${err.message.split('\n')[0]}) — keeping ${pages} page(s)`);
      break;
    }
    if (entries.length === 0) break;
    pages++;

    const unseen = entries.filter((p) => !seenIds.has(p.id) && !idsThisCrawl.has(p.id));
    unseen.forEach((p) => idsThisCrawl.add(p.id));
    collected.push(...unseen);

    // Caught up with the previous crawl: everything on this page is already
    // recorded, so pages below it are older still.
    if (unseen.length === 0) break;

    after = entries[entries.length - 1].id;
    if (!after) break;
  }

  const matched = collected.filter((p) => DP_SIGNAL_RE.test(`${p.title} ${p.content}`));
  const kept = matched.slice(0, CAPS.newPosts);
  if (matched.length > kept.length) {
    console.warn(
      `  /new: ${matched.length} signal-matching post(s) found, keeping ${kept.length} (CAPS.newPosts). ` +
        `${matched.length - kept.length} dropped unread and marked unseen — they will resurface tomorrow.`
    );
  }
  return {
    label: `r/CreditCards new posts (${pages} page(s), ${collected.length} unseen)`,
    candidates: kept.map((p) => ({
      id: p.id,
      kind: 'post',
      title: truncate(p.title, 200),
      text: truncate(p.content, CAPS.bodyChars),
      url: p.link,
      posted: p.updated || TODAY,
    })),
  };
}

async function fetchMegathreadComments(seenIds) {
  await sleep(CAPS.requestSpacingMs); // space Reddit requests; the new-posts fetcher runs first
  const hot = parseAtom(await redditRss('https://www.reddit.com/r/CreditCards/hot/.rss?limit=10'));
  // Stickied megathreads surface at the top of /hot. Match the recurring
  // approval/DP thread shapes without pinning to one moderator's title format.
  const thread = hot.find((e) =>
    /(approval|denial|data ?point).{0,30}(thread|megathread)|weekly.{0,30}approv/i.test(e.title)
  );
  if (!thread) {
    return { label: 'r/CreditCards megathread (none found in /hot)', candidates: [] };
  }
  await sleep(CAPS.requestSpacingMs);
  const threadUrl = thread.link.replace(/\/$/, '');
  const entries = parseAtom(await redditRss(`${threadUrl}/.rss?sort=new&limit=100`));
  // First entry is the post itself; the rest are comments.
  const kept = entries
    .slice(1)
    .filter((c) => !seenIds.has(c.id))
    .filter((c) => c.content && c.content.length >= 60 && !/automatically|i am a bot/i.test(c.content))
    .slice(0, CAPS.threadComments);
  return {
    label: `r/CreditCards megathread "${truncate(thread.title, 80)}"`,
    candidates: kept.map((c) => ({
      id: c.id,
      kind: 'comment',
      title: truncate(c.content, 120),
      text: truncate(c.content, CAPS.bodyChars),
      url: c.link || threadUrl,
      posted: c.updated || TODAY,
    })),
  };
}

// ── OP reply expansion ───────────────────────────────────────────────────────

// A post body that already quotes a plausible FICO number is less likely to
// need its comments read. Deliberately loose: this only orders the expansion
// queue, it never excludes a post outright.
function hasPlausibleScore(text) {
  const matches = (text || '').match(/\b\d{3}\b/g) || [];
  return matches.some((n) => Number(n) >= 300 && Number(n) <= 850);
}

const STRONG_OUTCOME_RE = /(approved|denied|rejected|instant.{0,12}(approval|decision)|got (the card|approved|denied))/i;

// Posts most worth an extra request first: an outcome the OP describes but no
// score in the body is exactly the case where the score sits in a reply.
function rankForExpansion(candidates) {
  return candidates
    .filter((c) => c.kind === 'post' && /\/comments\//.test(c.url))
    .map((c) => {
      const body = `${c.title} ${c.text}`;
      const priority = (hasPlausibleScore(body) ? 0 : 2) + (STRONG_OUTCOME_RE.test(body) ? 1 : 0);
      return { candidate: c, priority };
    })
    .sort((a, b) => b.priority - a.priority)
    .map((r) => r.candidate);
}

/**
 * Fetch a post's comment feed and return the post itself plus the OP's own
 * replies.
 *
 * The permalink feed's first entry is the post, which is what makes this
 * reliable: it names the author we then filter comments by, so we never have to
 * trust an author parsed out of a different feed. A revisit needs that first
 * entry for its body too — pending state stores only ids and a one-line note, so
 * the post text comes back fresh (and current, if it was edited) on each look.
 */
async function fetchPostSnapshot(url) {
  const feedUrl = `${url.replace(/\/$/, '')}/.rss?sort=new&limit=100`;
  const entries = parseAtom(await redditRss(feedUrl));
  if (entries.length === 0) return { title: '', body: '', replies: [] };
  const post = entries[0];
  const op = post.author;
  const replies = !op
    ? []
    : entries
        .slice(1)
        .filter((c) => c.author === op)
        .filter((c) => c.content && c.content.length >= 20)
        .filter((c) => !/^\[(deleted|removed)\]$/i.test(c.content.trim()))
        .slice(0, CAPS.opCommentsPerPost)
        .map((c) => truncate(c.content, CAPS.opCommentChars));
  return { title: post.title || '', body: post.content || '', replies };
}

async function fetchOpReplies(candidate) {
  const { replies } = await fetchPostSnapshot(candidate.url);
  return replies;
}

/**
 * Shared comment-feed request budget for one run.
 *
 * Bails out on sustained Reddit pushback, tracked as two separate signals
 * because they look nothing alike from in here:
 *
 *   failures  — the feed threw. Cheap to detect, and the candidate loses its
 *               replies. Cap is tight (2).
 *   throttled — the feed 429'd and only succeeded after a 61s backoff. The
 *               caller still gets its data, so this is invisible to a
 *               failure counter, but it is the expensive case: the 2026-07-30
 *               run took 7 backoffs across 8 posts, about 7 minutes of the
 *               fetch phase, without tripping a single failure. Cap is looser
 *               (3) since these requests do deliver.
 *
 * The counters live on the budget rather than inside one loop because revisits
 * and fresh expansion both spend from it. A run that gets throttled out of its
 * revisits has no business then trying eight speculative expansions.
 */
function createReplyBudget(remaining = CAPS.replyRequests) {
  return { remaining, consecutiveFailures: 0, consecutiveThrottled: 0, failures: 0, stopped: null };
}

function budgetStopReason(budget) {
  if (budget.remaining <= 0) return 'request budget spent';
  if (budget.consecutiveFailures >= CAPS.abortAfterFailures) {
    return `${budget.consecutiveFailures} consecutive failures (likely Reddit rate limiting)`;
  }
  if (budget.consecutiveThrottled >= CAPS.abortAfterThrottled) {
    return `${budget.consecutiveThrottled} consecutive 429 backoffs (Reddit is throttling; each costs 61s)`;
  }
  return null;
}

/**
 * Run `queue` through the comment-feed fetcher against a shared budget, handing
 * each successful snapshot to `onSnapshot`. Never throws: a post whose feed
 * fails just goes to the model without its replies.
 */
async function fetchSnapshots(queue, budget, onSnapshot, { label }) {
  let attempted = 0;
  let got = 0;
  for (const item of queue) {
    const stop = budgetStopReason(budget);
    if (stop) {
      // Say what was dropped either way: a silent cap here reads as "no replies
      // existed", which is the same false negative shape as a missed data point.
      const skipped = queue.length - attempted;
      budget.stopped = stop;
      console.warn(`  ! ${label} stopped after ${stop} — ${skipped} post(s) not fetched`);
      break;
    }
    attempted++;
    budget.remaining--;
    await sleep(CAPS.requestSpacingMs);
    const backoffsBefore = getRateLimitBackoffs();
    try {
      const snapshot = await fetchPostSnapshot(item.url);
      budget.consecutiveFailures = 0;
      if (onSnapshot(item, snapshot)) got++;
    } catch (err) {
      budget.failures++;
      budget.consecutiveFailures++;
      console.warn(`  ! ${label} for ${item.id} failed: ${err.message.split('\n')[0]}`);
    }
    // Counted on both paths: a request can back off and then still fail.
    budget.consecutiveThrottled =
      getRateLimitBackoffs() > backoffsBefore ? budget.consecutiveThrottled + 1 : 0;
  }
  return { attempted, got };
}

// Mutates candidates in place, adding `opReplies` where any were found.
// Replies are a bonus on top of the post body, so quitting early costs a
// little recall and saves the run.
async function expandOpReplies(candidates, budget = createReplyBudget()) {
  const queue = rankForExpansion(candidates).slice(0, Math.min(CAPS.expandPosts, budget.remaining));
  const { attempted, got } = await fetchSnapshots(
    queue,
    budget,
    (candidate, { replies }) => {
      if (replies.length === 0) return false;
      candidate.opReplies = replies;
      return true;
    },
    { label: 'OP reply expansion' }
  );
  return { attempted, expanded: got, failures: budget.failures, throttled: getRateLimitBackoffs() };
}

/**
 * Re-read the pending near-misses and hand them back as candidates.
 *
 * Deliberately re-presents the post even when no new replies showed up: the
 * point of the bucket is that a human (or a later, better-informed pass) gets
 * another look at a post we know carried a real outcome, and the request has
 * already been spent by the time we know whether it was fruitful.
 */
async function revisitPending(pending, budget) {
  const queue = rankPending(pending)
    .slice(0, Math.min(CAPS.revisitPosts, budget.remaining))
    .map(({ id, entry }) => ({ id, url: entry.url, entry }));

  const candidates = [];
  const { attempted } = await fetchSnapshots(
    queue,
    budget,
    ({ id, url, entry }, snapshot) => {
      entry.attempts = (entry.attempts || 0) + 1;
      entry.lastChecked = TODAY;
      candidates.push({
        id,
        kind: 'post',
        revisit: true,
        missing: entry.missing || [],
        known: { card_name: entry.card_name, result: entry.result },
        note: entry.note || '',
        firstSeen: entry.firstSeen || TODAY,
        attempts: entry.attempts,
        title: truncate(snapshot.title || entry.title || '', 200),
        text: truncate(snapshot.body || '', CAPS.bodyChars),
        url,
        posted: entry.posted || entry.firstSeen || TODAY,
        opReplies: snapshot.replies,
      });
      return snapshot.replies.length > 0;
    },
    { label: 'Pending revisit' }
  );
  return { attempted, candidates };
}

// ── Extraction prompt ────────────────────────────────────────────────────────

function buildCardListSection(cards) {
  return cards
    .map((c) => {
      const aliases = c.previous_names.length ? ` (previously: ${c.previous_names.join('; ')})` : '';
      return `- ${c.name} [${c.bank}]${aliases}`;
    })
    .join('\n');
}

function renderCandidate(c, label) {
  const lines = [`[${label}] (${c.kind}, posted ${c.posted}, id ${c.id}) ${c.title}`];
  lines.push(`    URL: ${c.url}`);
  if (c.revisit) {
    const known = [c.known?.card_name, c.known?.result].filter(Boolean).join(', ');
    lines.push(`    REVISIT (look ${c.attempts} of ${PENDING_MAX_ATTEMPTS}, first seen ${c.firstSeen})`);
    if (known) lines.push(`    Already established: ${known}`);
    lines.push(`    Still missing: ${(c.missing || []).join(', ') || 'unknown'}`);
    if (c.note) lines.push(`    Earlier note: ${c.note}`);
  }
  if (c.text && c.text !== c.title) lines.push(`    Text: ${c.text}`);
  for (const reply of c.opReplies || []) {
    lines.push(`    OP reply: ${reply}`);
  }
  return lines.join('\n');
}

function buildRevisitSection(revisits) {
  if (revisits.length === 0) return '';
  return `## Revisits (${revisits.length})

These posts were read on an earlier run. Each one carried a real, first-person outcome on a catalog card, and was held back only because a required field was missing. They are listed again because posters often answer in a comment hours later, so the body and the OP replies below are **freshly re-fetched as of today**.

Read each one the same way as any other candidate, with one difference: you already know what was established, and you are looking for the field named in "Still missing".

- If the missing field is now there, write a normal data point to \`proposed/\`. Use the current post text and replies, not your memory of it.
- If it is still missing, write the entry to \`pending/\` again so the next run keeps chasing it (and keep the same \`missing\` list unless what is missing has genuinely changed).
- If the post now shows the outcome was never real (it was a pre-qual, a hypothetical, or the poster corrected themselves), write neither file. It drops out of the bucket and stops costing requests.

An entry not re-declared in \`pending/\` is dropped, so silence means "give up on this one".

${revisits.map((c, i) => renderCandidate(c, `R${i + 1}`)).join('\n\n')}
`;
}

function buildExtractPrompt({ candidates, cards }) {
  const revisits = candidates.filter((c) => c.revisit);
  const fresh = candidates.filter((c) => !c.revisit);
  const numbered = fresh.map((c, i) => renderCandidate(c, i + 1)).join('\n\n');

  return `# Reddit Data Point Extraction — ${TODAY}

You are a meticulous data curator for CreditOdds. From the r/CreditCards candidates below, extract application data points: a poster reporting the outcome of THEIR OWN credit card application. These become public odds data, so precision beats recall — when a field is ambiguous, omit the field; when the whole data point is ambiguous, skip it. Extracting zero data points from a quiet day is a successful run.

## A data point MUST have all of
1. **A stated outcome**: the poster submitted a real application and was approved or denied. Pending applications, reconsideration-line limbo, and "what are my odds?" questions are NOT outcomes.

   **Pre-qualification is never an outcome, in either direction.** Not an offer received, not a "pre-approved" banner, and not a pre-qual tool turning someone down — even when that rejection quotes an issuer reason and full credit stats, which makes it look exactly like a real denial. Pre-qual is a soft-pull marketing check against different criteria than the real underwriting decision, so recording it would mix two different questions into one odds number. If the poster later actually applies and reports that result, THAT is the data point. Phrases to treat as pre-qual: "pre-approval tool", "pre-qualified", "prequal", "checked my odds", "got denied on the pre-approval page".
2. **First person**: their own application. Skip second-hand reports ("my wife got approved" is allowed ONLY when the poster gives that person's full details; "my friend says" is not), hypotheticals, jokes, and obvious sarcasm.
3. **A usable credit score**: 300–850.
   - A point value always qualifies: "742", "about 750" (use 750), "~765".
   - **A range qualifies when its spread is ${MAX_SCORE_RANGE_SPREAD} points or fewer — record the LOWER bound.** "753-758" → 753. "760-770" → 760. This mirrors how bounded income is handled: a value that understates in a known direction beats losing the row, and a spread that narrow is smaller than the month-to-month drift in anyone's real score.
   - A wider range does NOT qualify, because its lower bound is a guess rather than a bound: "736-770ish", "580-600", "700-730" → skip.
   - Vague descriptions never qualify: "mid 700s", "good credit", "excellent credit".
   - A floor is not a range and does NOT qualify: "770+", "740 or above" → skip. Unlike income, where a floor is a real lower bound on a quantity, a score floor is usually the poster rounding up and the true value is unknowable.
4. **A card in the catalog below**: match against current names and the "previously:" aliases, but always output the CURRENT catalog name, exactly as written. If the card is not in the catalog, skip the data point and mention the card in your run report instead.
5. **A datable application**: you can place the application in a specific month. The default is the month the post was written, which is almost always right because people post about an application when it happens. Historical posts are in scope — anything within the last ${MAX_DATA_POINT_AGE_MONTHS / 12} years counts, so do NOT skip a data point merely for being old. Skip only when the application cannot be dated at all, or when the poster describes an application from before that window.

Any of these may come from the post body or from an \`OP reply\` line — see below.

## OP reply lines
Some candidates carry \`OP reply:\` lines. Those are later comments on that same post written by the post's own author, already filtered for you (comments by anyone else are never included). Read them as a continuation of the poster's first-person account: an outcome, score, income, or limit stated in a reply counts exactly as if it were in the body, and a reply may resolve a body that got truncated. Two cautions: a reply that answers a hypothetical ("if I applied I'd probably be around 700") is still not a stated outcome, and when a reply corrects the body, the reply wins. The absence of \`OP reply\` lines means nothing — most posts are never expanded.

## Field extraction rules
- **result**: \`approved\` or \`denied\`.
- **credit_score**: the score the poster cites for the application.
- **credit_score_source**: 0 = FICO/unspecified (the default), 1 = Experian FICO, 2 = TransUnion FICO, 3 = Equifax FICO, 4 = VantageScore (also use 4 for Credit Karma scores — Credit Karma is VantageScore).
- **listed_income**: annual income in whole dollars when stated ("$85k" → 85000). Convert monthly ("$7k/month" → 84000). Bounded-but-imprecise figures record the bound rather than being dropped: an open-ended floor takes the floor ("$250k+", "at least $250k", "250k or more" → 250000) and a range takes its lower bound ("$80-90k" → 80000). Both understate by a known direction, which is more useful than losing the field. Still omit when income is unquantified ("six figures", "good income", "comfortable") or when household vs personal is unclear — for that split, use what the poster says they put on the application.
- **length_credit**: years of credit history, nearest whole year ("18 months" → 2). Omit when unstated.
- **starting_credit_limit**: approvals only, whole dollars ("SL $10k" → 10000). Omit when unstated.
- **total_open_cards**: open credit cards at time of application. Do NOT confuse with "cards opened in the last 24 months" (that is velocity, not open cards). Omit when unclear.
- **inquiries_3 / inquiries_12 / inquiries_24**: hard inquiries in the last 3/12/24 months. Only when the poster clearly counts inquiries — do not derive from card-opening history. Omit when unclear.
- **bank_customer**: true/false ONLY when the post states a relationship with the issuing bank ("been with Chase 10 years" → true; "no prior relationship" → false). Omit when unstated — do not guess.
- **date_applied**: "YYYY-MM". **Use the post's month**, unless the post states the application date explicitly ("applied 3/14", "applied last month", the open date in a card list) — an explicit date always wins over the post month. Never in the future. On a historical sweep the post month IS the application month for practically every data point, so do not agonise over it.
- **reason_denied** (denials only): a SHORT paraphrase in your own words of the issuer-cited reason, max 100 chars, plain factual tone, no em dashes (this text renders on the public site). Omit when the poster does not give a reason.
- **reason_denied_code** (denials only): one of ${REASON_DENIED_CODES.join(', ')}. Use \`not_specified\` when no reason is given at all; otherwise pick the closest code. Two pairs are easy to confuse:
  - \`length_of_credit_too_short\` is about TIME (a thin or young file). \`too_few_accounts\` is about COUNT ("too few established/open accounts") and applies even to someone with a 20-year history. Citi denials routinely cite the count, not the age.
  - \`too_much_credit_with_issuer\` means the issuer has already extended this person plenty. \`no_issuer_relationship\` is the opposite: the issuer cites having no existing account or deposit balance with them.
  When the issuer lists several reasons, code the FIRST one it cites and let \`reason_denied\` carry the rest.
- **evidence**: 1 sentence, YOUR OWN paraphrase of what the post reports (never a verbatim quote). This is review context for the human only — it is not imported.

## Output
One YAML file per data point at \`.reddit-dp-work/proposed/<n>.yaml\` (n = 1, 2, 3, …):

\`\`\`yaml
source_id: "t3_1abcde"          # the candidate's id, exactly as shown; append "#2", "#3" when one candidate yields several data points
permalink: "https://www.reddit.com/r/CreditCards/comments/..."   # the candidate's URL
posted: "2026-07-27"            # the candidate's posted date
card_name: "Chase Sapphire Preferred"
result: "approved"
credit_score: 742
credit_score_source: 0
listed_income: 85000
length_credit: 6
starting_credit_limit: 10000
bank_customer: true
date_applied: "2026-07"
evidence: "Poster reports approval with a 742 score, $85k income, and a $10k starting limit."
\`\`\`

Omit unknown optional fields entirely (no nulls). One candidate reporting several applications ("approved for CSP, denied for Amex Gold") produces several files with #2/#3 suffixes on the same source_id. Hard cap: 25 data points per run — keep the clearest ones if a megathread overflows.

## Near-misses: the pending bucket

A post can clear every bar above except one and still be unpublishable — most often a real, first-person, catalog-card denial with no credit score anywhere in it. Do not just drop those. Write them to \`.reddit-dp-work/pending/<n>.yaml\` so later runs re-read the post (posters answer in comments hours later) and so the missing field can be asked about by hand:

\`\`\`yaml
source_id: "t3_1abcde"
missing: ["credit_score"]        # one or more of: ${PENDING_MISSING_FIELDS.join(', ')}
card_name: "Bank of America Premium Rewards Elite"   # omit if the card is what is missing
result: "denied"                                     # omit if the result is what is missing
note: "Denial cited no existing banking relationship. Poster never gave a score."
\`\`\`

Declare an entry pending ONLY when **all** of these hold:
- The poster states a real, first-person application outcome (the same bar as rule 1 above, so never a pre-qual and never a hypothetical).
- Everything else needed is present, and **at most two** of ${PENDING_MISSING_FIELDS.join(' / ')} are missing.
- The gap is something the poster could plausibly answer. "They never said their score" is pending. "They were vague about whether they actually applied" is a skip.

A "what are my odds?" post, a recommendation-template post, or a pre-qual rejection is NOT pending. It is a skip, same as before. The bucket is expensive (one Reddit request per entry per run, against a feed that throttles us) and it is only worth spending on a row we would publish the moment one number arrives.

\`note\` is your own paraphrase and gets read by a human deciding whether to go ask the poster, so say what is established and what is missing in one line.

## Accounting: every candidate needs a disposition

Skipping is the right call most of the time, and none of the bars above are relaxed by this section. But a skip has to be **recorded**, not just performed. Every candidate you were shown must end up in exactly one of three places:

1. \`proposed/\` — it publishes,
2. \`pending/\` — a real outcome missing one field, worth chasing,
3. \`.reddit-dp-work/skipped.yaml\` — everything else, with a reason.

Write \`skipped.yaml\` as one list, covering every candidate not in the other two buckets:

\`\`\`yaml
- source_id: "t3_1abcde"
  reason: no_outcome
- source_id: "t3_1fghij"
  reason: card_not_in_catalog
  card: "Sofi Everyday Cash Rewards"      # required for this reason: the card as the poster named it
  note: "Approved, 715 TransUnion, but the card is not in our catalog."
- source_id: "t3_1klmno"
  reason: other
  note: "Post was deleted between the fetch and now."   # required for \`other\`
\`\`\`

Valid reasons, and nothing else:

${Object.entries(SKIP_REASONS).map(([k, v]) => `- \`${k}\` — ${v}`).join('\n')}

Pick the reason for the **first** bar the candidate fails, reading the numbered rules top to bottom: a "what are my odds?" post with no score is \`no_outcome\`, not \`no_score\`. \`note\` is optional everywhere except \`other\`, but one short clause is worth writing whenever the reason alone would puzzle someone reading it back later.

Why this matters: the seen-state retires every candidate presented, whether or not it produced anything, so a candidate you drop is gone permanently. The finish phase reports any candidate you left unaccounted for, and that warning goes in the PR — so silence is not neutral, it reads as a possible lost data point. If a candidate is genuinely off-topic noise, \`no_outcome\` covers it in one line; use it freely.

## Card catalog (output card_name exactly as listed)
${buildCardListSection(cards)}
${buildRevisitSection(revisits)}
## New candidates (${fresh.length})

${numbered}

If nothing qualifies, \`proposed/\` and \`pending/\` stay empty and every candidate goes in \`skipped.yaml\` with its reason — that is a successful run, fully accounted for. Either way, end your run report with data-point counts, pending entries opened or resolved, the skip breakdown, and any catalog-missing cards you saw.
`;
}

// ── Follow-up report ─────────────────────────────────────────────────────────

// What to ask the poster, by field. These are suggestions for a human to send
// in their own words, not something the routine posts: commenting from a real
// account is a separate decision with its own consequences on r/CreditCards.
const FOLLOWUP_QUESTIONS = {
  credit_score: 'What was your score at the time, and which bureau?',
  card_name: 'Which card exactly was it?',
  date_applied: 'Roughly when did you apply?',
  result: 'How did it end up, approved or denied?',
};

function buildFollowups(pending) {
  const entries = rankPending(pending);
  if (entries.length === 0) {
    return `# Reddit data-point follow-ups — ${TODAY}\n\nNothing pending. Every outcome found so far either published or was dropped.\n`;
  }
  const blocks = entries.map(({ id, entry }) => {
    const missing = entry.missing || [];
    const known = [entry.card_name, entry.result].filter(Boolean).join(' · ') || 'outcome recorded';
    const questions = missing.map((f) => FOLLOWUP_QUESTIONS[f]).filter(Boolean);
    const looksLeft = Math.max(0, PENDING_MAX_ATTEMPTS - (entry.attempts || 0));
    return [
      `### ${known}`,
      `- **Post:** ${entry.url}`,
      `- **Missing:** ${missing.join(', ') || 'unknown'}`,
      entry.note ? `- **What we have:** ${entry.note}` : null,
      `- **Suggested ask:** ${questions.join(' ') || 'Ask for the missing field above.'}`,
      `- First seen ${entry.firstSeen}, ${entry.attempts || 0} revisit(s) so far, ${looksLeft} left before it ages out.`,
      `- \`${id}\``,
    ]
      .filter(Boolean)
      .join('\n');
  });

  return `# Reddit data-point follow-ups — ${TODAY}

${entries.length} post(s) reported a real application outcome we could not publish, each missing one required field. Later runs re-read them automatically for ${PENDING_MAX_DAYS} days or ${PENDING_MAX_ATTEMPTS} looks, whichever comes first. If you want to ask the poster directly, these are the ones worth asking, with what is missing from each.

${blocks.join('\n\n')}
`;
}

// ── Validation (finish phase) ────────────────────────────────────────────────

// Pending entries are cheap to get wrong and expensive to keep: a malformed one
// would burn a Reddit request every run until it aged out. Validated separately
// from data points because almost every field a data point requires is, by
// definition, the thing a pending entry does not have.
function validatePendingEntry(entry, { candidateById, cardByName, aliasToName }) {
  const errors = [];
  const sourceId = String(entry.source_id || '').replace(/#\d+$/, '');
  if (!/^t[13]_[a-z0-9]+$/.test(sourceId)) return { errors: ['invalid source_id'] };
  const candidate = candidateById.get(sourceId);
  if (!candidate) errors.push(`source_id ${sourceId} is not one of this run's candidates`);
  // Megathread comments have no permalink of their own to re-fetch, so they can
  // never be revisited. Catching it here keeps a dead id out of the state file.
  if (candidate && candidate.kind !== 'post') errors.push('only posts can be revisited (comment has no feed of its own)');

  const missing = Array.isArray(entry.missing) ? entry.missing.filter((f) => typeof f === 'string') : [];
  if (missing.length === 0) errors.push('missing[] must name at least one field');
  const unknown = missing.filter((f) => !PENDING_MISSING_FIELDS.includes(f));
  if (unknown.length) errors.push(`unknown missing field(s): ${unknown.join(', ')} (allowed: ${PENDING_MISSING_FIELDS.join(', ')})`);
  // Three-plus missing fields is not a near-miss, it is a post we did not
  // understand — and it would still be unpublishable if one of them arrived.
  if (missing.length > 2) errors.push(`${missing.length} missing fields — that is a skip, not a near-miss`);

  let cardName = typeof entry.card_name === 'string' ? entry.card_name.trim() : '';
  if (cardName && !cardByName.has(cardName) && aliasToName.has(cardName)) cardName = aliasToName.get(cardName);
  if (cardName && !cardByName.has(cardName)) errors.push(`card_name "${cardName}" not in the catalog`);
  if (!cardName && !missing.includes('card_name')) errors.push('card_name is required unless it is what is missing');
  if (entry.result != null && entry.result !== 'approved' && entry.result !== 'denied') {
    errors.push('result must be "approved", "denied", or omitted when it is what is missing');
  }
  if (!entry.result && !missing.includes('result')) errors.push('result is required unless it is what is missing');

  return {
    errors,
    entry:
      errors.length > 0
        ? null
        : {
            url: candidate.url,
            title: truncate(candidate.title || '', 200),
            posted: candidate.posted,
            card_name: cardName || undefined,
            result: entry.result || undefined,
            missing,
            note: truncate(String(entry.note || ''), 300),
          },
  };
}

function isIntInRange(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

function validateDataPoint(dp, { candidateById, cardByName, aliasToName, usedSourceIds, importedIds, priorRecords = [] }) {
  const errors = [];
  const warnings = [];

  const sourceId = String(dp.source_id || '');
  const baseId = sourceId.replace(/#\d+$/, '');
  if (!/^t[13]_[a-z0-9]+(#\d+)?$/.test(sourceId)) {
    errors.push('invalid source_id (need t3_/t1_ fullname, optional #n suffix)');
  } else {
    if (!candidateById.has(baseId)) errors.push(`source_id ${baseId} is not one of this run's candidates`);
    if (usedSourceIds.has(sourceId)) errors.push(`duplicate source_id ${sourceId} within this batch`);
    if (importedIds.has(baseId)) errors.push(`source ${baseId} already has imported data points`);
  }

  const candidate = candidateById.get(baseId);
  if (candidate && dp.permalink !== candidate.url) {
    warnings.push('permalink does not match the candidate URL — rewrote it');
    dp.permalink = candidate.url;
  }
  if (candidate) dp.posted = candidate.posted;

  // Canonicalize the card name (previous_names aliases fold into the current name).
  let cardName = typeof dp.card_name === 'string' ? dp.card_name.trim() : '';
  if (!cardByName.has(cardName) && aliasToName.has(cardName)) {
    warnings.push(`card_name "${cardName}" is a previous name — canonicalized to "${aliasToName.get(cardName)}"`);
    cardName = aliasToName.get(cardName);
  }
  if (!cardByName.has(cardName)) {
    errors.push(`card_name "${cardName}" not in the catalog`);
  } else {
    dp.card_name = cardName;
  }

  if (dp.result !== 'approved' && dp.result !== 'denied') errors.push('result must be "approved" or "denied"');
  if (!isIntInRange(dp.credit_score, 300, 850)) errors.push('credit_score must be an integer 300–850');
  if (!isIntInRange(dp.credit_score_source, 0, 4)) errors.push('credit_score_source must be an integer 0–4');

  const optionalRanges = [
    ['listed_income', 0, 1000000],
    ['length_credit', 0, 100],
    ['starting_credit_limit', 0, 1000000],
    ['total_open_cards', 0, 500],
    ['inquiries_3', 0, 50],
    ['inquiries_12', 0, 50],
    ['inquiries_24', 0, 50],
  ];
  for (const [field, min, max] of optionalRanges) {
    if (dp[field] != null && !isIntInRange(dp[field], min, max)) {
      errors.push(`${field} must be an integer ${min}–${max} (or omitted)`);
    }
  }
  if (dp.bank_customer != null && typeof dp.bank_customer !== 'boolean') {
    errors.push('bank_customer must be true/false (or omitted)');
  }

  const dateApplied = String(dp.date_applied || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(dateApplied)) {
    errors.push('date_applied must be "YYYY-MM"');
  } else {
    if (dateApplied > THIS_MONTH) errors.push('date_applied is in the future');
    const monthsAgo =
      (Number(THIS_MONTH.slice(0, 4)) - Number(dateApplied.slice(0, 4))) * 12 +
      (Number(THIS_MONTH.slice(5)) - Number(dateApplied.slice(5)));
    if (monthsAgo > MAX_DATA_POINT_AGE_MONTHS) {
      errors.push(`date_applied is ${monthsAgo} months old — beyond the ${MAX_DATA_POINT_AGE_MONTHS}-month window`);
    }
  }

  if (dp.result === 'approved') {
    if (dp.reason_denied || dp.reason_denied_code) {
      warnings.push('dropped denial fields on an approval');
      delete dp.reason_denied;
      delete dp.reason_denied_code;
    }
  } else {
    if (dp.starting_credit_limit != null) {
      warnings.push('dropped starting_credit_limit on a denial');
      delete dp.starting_credit_limit;
    }
    if (dp.reason_denied != null) {
      if (typeof dp.reason_denied !== 'string' || dp.reason_denied.length > 254) {
        errors.push('reason_denied must be a string ≤254 chars');
      } else if (/—/.test(dp.reason_denied)) {
        errors.push('em dash in reason_denied (renders on the public site)');
      }
    }
    if (dp.reason_denied_code != null && !REASON_DENIED_CODES.includes(dp.reason_denied_code)) {
      errors.push(`invalid reason_denied_code (allowed: ${REASON_DENIED_CODES.join(', ')})`);
    }
  }

  if (typeof dp.evidence === 'string' && dp.evidence.length > 300) {
    dp.evidence = `${dp.evidence.slice(0, 297)}…`;
    warnings.push('evidence truncated to 300 chars');
  }

  // Cross-post duplicate check, last because it needs the canonicalized
  // card_name and the validated score/date above. Only meaningful on a row that
  // is otherwise sound, so skip it when the row is already failing.
  if (errors.length === 0) {
    const twin = priorRecords.find((other) => looksLikeSameApplication(dp, other));
    if (twin) {
      errors.push(
        `looks like the same application as ${twin.source_id} ` +
          `(${dp.card_name}, ${dp.result}, score ${dp.credit_score}, ${dp.date_applied}) — ` +
          `same application reported in two posts, or a genuine coincidence. Delete this file if it is a duplicate; ` +
          `if the two are really different people, add a distinguishing field (${DISTINGUISHING_FIELDS.join('/')}) to tell them apart.`
      );
    }
  }

  return { errors, warnings };
}

// Field order for the committed YAML — review-context fields first, then the
// imported fields in the records-table order.
const OUTPUT_FIELD_ORDER = [
  'source_id', 'permalink', 'posted', 'evidence',
  'card_name', 'result', 'credit_score', 'credit_score_source', 'listed_income',
  'length_credit', 'starting_credit_limit', 'total_open_cards',
  'inquiries_3', 'inquiries_12', 'inquiries_24', 'bank_customer',
  'date_applied', 'reason_denied', 'reason_denied_code',
];

function writeDataPointFile(dp) {
  const ordered = {};
  for (const key of OUTPUT_FIELD_ORDER) {
    if (dp[key] != null) ordered[key] = dp[key];
  }
  const filename = `${TODAY}-${dp.source_id.replace('#', '_')}.yaml`;
  const filepath = path.join(DATAPOINTS_DIR, filename);
  if (fs.existsSync(filepath)) {
    console.log(`  Skipping ${filename} (already exists)`);
    return null;
  }
  fs.writeFileSync(filepath, yaml.dump(ordered, { quotingType: '"', forceQuotes: true, lineWidth: -1 }));
  console.log(`  Wrote ${filepath}`);
  return filename;
}

// Near-misses ride along in the PR body because that is where the review
// already happens. They are not files in the PR and merging does nothing to
// them: this is a list of posts to go ask about, and the routine keeps
// re-reading them on its own either way.
function buildPendingSection(pending) {
  const entries = rankPending(pending || {});
  if (entries.length === 0) return '';
  const rows = entries
    .map(({ entry }) => {
      const known = [entry.card_name, entry.result].filter(Boolean).join(' · ') || '—';
      const asks = (entry.missing || []).map((f) => FOLLOWUP_QUESTIONS[f]).filter(Boolean).join(' ');
      return `| [${truncate(entry.title || 'post', 60)}](${entry.url}) | ${known} | ${(entry.missing || []).join(', ')} | ${asks || '—'} |`;
    })
    .join('\n');

  return `
### Needs one more field (${entries.length})

Real first-person outcomes we could not publish. Later runs re-read each post for ${PENDING_MAX_DAYS} days or ${PENDING_MAX_ATTEMPTS} looks in case the poster answers in a comment. Nothing here is a file in this PR, and merging does not change them — this is the list to ask about by hand if you want to.

| Post | Established | Missing | Suggested ask |
|---|---|---|---|
${rows}
`;
}

// What the run did with everything it read but did not publish. Sits in the PR
// because the reviewer's standing question is "is this all there was?", and a
// PR showing one row out of twenty candidates cannot answer it on its own.
function buildDispositionSection(d) {
  if (!d) return '';
  const rows = Object.entries(d.byReason).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0 && d.unaccounted.length === 0) return '';

  const lines = ['### Candidates that produced nothing', ''];
  if (rows.length > 0) {
    lines.push('| Reason | Count | Meaning |', '|---|---|---|');
    rows.forEach(([reason, n]) => lines.push(`| \`${reason}\` | ${n} | ${SKIP_REASONS[reason]} |`));
    lines.push('');
  }
  if (d.catalogGaps.length > 0) {
    lines.push(
      `**Cards in real data points but missing from the catalog:** ${d.catalogGaps.map((c) => `\`${c}\``).join(', ')}. ` +
        'Adding one turns every future post about it into publishable odds data.',
      ''
    );
  }
  if (d.unaccounted.length > 0) {
    lines.push(
      `⚠️ **${d.unaccounted.length} candidate(s) were never accounted for** — read but neither published, ` +
        'pended, nor given a skip reason. They are already marked seen and will not be re-presented.',
      ''
    );
  }
  return `${lines.join('\n')}\n`;
}

function buildPrBody(written, pending, dispositions) {
  const fmt = (v, prefix = '') => (v == null ? '—' : `${prefix}${typeof v === 'number' ? v.toLocaleString('en-US') : v}`);
  const rows = written
    .map(({ dp, filename }) =>
      [
        `[${dp.source_id}](${dp.permalink})`,
        dp.card_name,
        dp.result,
        dp.credit_score,
        fmt(dp.listed_income, '$'),
        fmt(dp.starting_credit_limit, '$'),
        fmt(dp.length_credit),
        dp.date_applied,
        `\`${filename}\``,
      ].join(' | ')
    )
    .map((r) => `| ${r} |`)
    .join('\n');

  return `## Proposed Reddit data points — ${TODAY}

Extracted from public r/CreditCards posts by the daily \`reddit-datapoints-local\` task. Each row below is one file in \`data/reddit-datapoints/\`; the \`evidence\` line inside each file says what the post reports.

| Source | Card | Result | Score | Income | Limit | History (yrs) | Applied | File |
|---|---|---|---|---|---|---|---|---|
${rows}

### How to review
1. Spot-check rows against their source links (each Source cell links to the Reddit post).
2. **Reject a row** by deleting its file from this PR (GitHub → Files changed → ⋯ → Delete file). Rejected sources are never re-proposed — the seen-state was already recorded.
3. **Reject everything** by closing the PR.
4. **Accept the rest by merging.**
${buildPendingSection(pending)}${buildDispositionSection(dispositions)}
### What merging does
\`sync-datapoints.yml\` invokes the \`creditodds-import-reddit-records\` Lambda, which inserts the accepted rows into the \`records\` table (submitter_id \`reddit:<source_id>\`, so imports are distinguishable and idempotent). Card stats refresh within ~5 minutes; CloudFront/ISR caching means public pages update within ~10.
`;
}

// ── Pending reconciliation (finish phase) ────────────────────────────────────

/**
 * Fold the session's re-declarations back into the carried bucket.
 *
 * Silence drops an entry — but only when the session was actually SHOWN it.
 * The revisit queue is capped (CAPS.revisitPosts) and draws from a request
 * budget that Reddit's 429s regularly exhaust, so on a throttled run some
 * pending entries never reach the prompt at all, and an entry that was never
 * presented cannot be re-declared: validatePendingEntry rejects any source_id
 * outside this run's candidates. Dropping those would make rate limiting look
 * like a judgment call, and silently — their attempts counter was never even
 * incremented, so they never spent a look. Seen live on 2026-08-06: three
 * entries (two 429s, one cut by the request budget) fell out of the state file
 * with attempts and days still left in their windows.
 *
 * So the split is by whether the entry was presented, not by whether it came
 * back:
 *   presented + re-declared  → keeps its history, attempts already bumped
 *   presented + silent       → dropped, which is the session saying "give up"
 *   never presented          → carried forward untouched
 *
 * Carrying forward is not a reprieve: firstSeen and attempts ride along
 * unchanged, so pendingExpiry() ages the entry out on a later fetch phase
 * exactly as it would have.
 */
function mergePending({ carried, declared, candidateById }) {
  const pending = { ...declared };
  const carriedForward = [];
  for (const [id, entry] of Object.entries(carried)) {
    if (pending[id] || candidateById.has(id)) continue;
    // firstSeen is what bounds an entry's life, and a carried entry is never
    // re-stamped, so a hand-edited state file missing it would otherwise live
    // forever. Fill the hole once; every other field rides along as-is.
    pending[id] = entry.firstSeen ? entry : { ...entry, firstSeen: TODAY };
    carriedForward.push({ id, entry: pending[id] });
  }
  return { pending, carriedForward };
}

// The staged state is the fetch phase's output, so finish has to read it back,
// fold in what the session decided, and rewrite it.
function reconcilePending(validationCtx) {
  const staged = fs.existsSync(STATE_UPDATED_FILE)
    ? JSON.parse(fs.readFileSync(STATE_UPDATED_FILE, 'utf8'))
    : { seen: {}, pending: {} };
  const carried = staged.pending && typeof staged.pending === 'object' ? staged.pending : {};

  const declared = {};
  const rejected = [];
  const files = fs.existsSync(PENDING_DIR) ? fs.readdirSync(PENDING_DIR).filter((f) => /\.ya?ml$/.test(f)) : [];
  for (const file of files) {
    let raw;
    try {
      raw = yaml.load(fs.readFileSync(path.join(PENDING_DIR, file), 'utf8'));
    } catch (err) {
      rejected.push(`${file}: unparseable YAML (${err.message.split('\n')[0]})`);
      continue;
    }
    if (!raw || typeof raw !== 'object') {
      rejected.push(`${file}: empty or not a mapping`);
      continue;
    }
    const { errors, entry } = validatePendingEntry(raw, validationCtx);
    if (errors.length) {
      rejected.push(`${file}: ${errors.join('; ')}`);
      continue;
    }
    const id = String(raw.source_id).replace(/#\d+$/, '');
    const prior = carried[id];
    declared[id] = {
      ...entry,
      // A re-declared entry keeps its history; a brand-new one starts its clock
      // today with the look it just got already counted.
      firstSeen: prior?.firstSeen || TODAY,
      attempts: prior?.attempts ?? 1,
      lastChecked: TODAY,
    };
  }

  const { pending, carriedForward } = mergePending({
    carried,
    declared,
    candidateById: validationCtx.candidateById,
  });
  return { staged, pending, rejected, carriedForward, carriedCount: Object.keys(carried).length };
}

function resolvePendingFor(result, publishedIds) {
  for (const id of publishedIds) {
    if (result.pending[id]) {
      result.resolved = (result.resolved || 0) + 1;
      delete result.pending[id];
    }
  }
}

// Rewrites the staged state and the follow-up list, then says what changed.
// `runs` is the completed run log; the staging-only `run` key is dropped here,
// so what lands in the committed state file stays {seen, pending, runs}.
function reportPending(result, runs) {
  const { staged, pending, rejected, resolved = 0, carriedForward = [] } = result;
  fs.writeFileSync(
    STATE_UPDATED_FILE,
    `${JSON.stringify({ seen: staged.seen || {}, pending, runs: runs || staged.runs || [] }, null, 2)}\n`
  );
  fs.writeFileSync(FOLLOWUPS_FILE, buildFollowups(pending));

  rejected.forEach((r) => console.log(`✗ pending/${r}`));

  // Say which entries the session never got to see. Left unsaid, a carried
  // entry is indistinguishable from one the session read and kept — and the
  // reason it was carried (the revisit cap, or Reddit throttling us out of the
  // request) is the thing worth knowing about the run.
  if (carriedForward.length > 0) {
    console.log(
      `\nPending carried forward (${carriedForward.length}): never re-presented this run ` +
        `(revisit cap or Reddit throttling), so no look was spent and nothing was dropped.`
    );
    for (const { entry } of carriedForward) {
      const known = [entry.card_name, entry.result].filter(Boolean).join(' ') || 'outcome';
      const looksLeft = Math.max(0, PENDING_MAX_ATTEMPTS - (entry.attempts || 0));
      console.log(
        `  - ${known}, missing ${(entry.missing || []).join('/')} — ` +
          `still ${looksLeft} look(s) left, first seen ${entry.firstSeen}`
      );
      console.log(`    ${entry.url}`);
    }
  }

  const count = Object.keys(pending).length;
  if (resolved > 0) console.log(`\nPending resolved: ${resolved} entr(ies) published after a revisit.`);
  if (count > 0 || rejected.length > 0) {
    console.log(
      `Pending: ${count} entr(ies) awaiting a field` +
        (rejected.length ? `, ${rejected.length} rejected` : '') +
        `. Ask-list: ${path.relative(REPO_ROOT, FOLLOWUPS_FILE)}`
    );
  }
}

// ── Dispositions: why each candidate produced nothing ────────────────────────

/**
 * Read .reddit-dp-work/skipped.yaml — the session's account of every candidate
 * it read and rejected.
 *
 * Validated as strictly as a proposed data point, for the same reason: a skip
 * log nobody can trust is worse than none, because it invites acting on a
 * breakdown that is really just what the extractor felt like typing. An
 * unknown reason, a skip for a post that was never a candidate, or a
 * `card_not_in_catalog` with no card name is a rejected entry, and a rejected
 * entry leaves its candidate unaccounted for — which the reconciler then
 * reports rather than letting it pass as explained.
 */
function loadSkipped(candidateById) {
  if (!fs.existsSync(SKIPPED_FILE)) return { entries: [], rejected: [] };

  let raw;
  try {
    raw = yaml.load(fs.readFileSync(SKIPPED_FILE, 'utf8'));
  } catch (err) {
    return { entries: [], rejected: [`skipped.yaml: unparseable YAML (${err.message.split('\n')[0]})`] };
  }
  if (raw == null) return { entries: [], rejected: [] };
  if (!Array.isArray(raw)) return { entries: [], rejected: ['skipped.yaml: expected a list of entries'] };

  const entries = [];
  const rejected = [];
  const seenHere = new Set();
  raw.forEach((item, i) => {
    const where = `skipped.yaml[${i}]`;
    if (!item || typeof item !== 'object') return rejected.push(`${where}: not a mapping`);

    const id = item.source_id ? String(item.source_id).replace(/#\d+$/, '') : '';
    if (!id) return rejected.push(`${where}: missing source_id`);
    if (!candidateById.has(id)) return rejected.push(`${where}: ${id} was not a candidate this run`);
    if (seenHere.has(id)) return rejected.push(`${where}: ${id} listed twice`);

    const reason = item.reason ? String(item.reason) : '';
    if (!reason) return rejected.push(`${where}: missing reason`);
    if (!SKIP_REASONS[reason]) {
      return rejected.push(`${where}: unknown reason "${reason}" (expected one of ${Object.keys(SKIP_REASONS).join(', ')})`);
    }
    const note = item.note ? String(item.note).trim() : '';
    const card = item.card ? String(item.card).trim() : '';
    if (SKIP_REQUIRES_NOTE.includes(reason) && !note) {
      return rejected.push(`${where}: reason "${reason}" requires a note`);
    }
    if (SKIP_REQUIRES_CARD.includes(reason) && !card) {
      return rejected.push(`${where}: reason "${reason}" requires the card name in \`card\``);
    }

    seenHere.add(id);
    entries.push({ id, reason, note, card });
  });
  return { entries, rejected };
}

/**
 * Every candidate presented this run must end up in exactly one bucket:
 * published, pending, or skipped-with-a-reason. Anything left over is
 * `unaccounted` — the session read it and said nothing.
 *
 * Unaccounted is deliberately loud. It is indistinguishable, in the state file,
 * from a candidate that was carefully judged and rejected, and it is exactly
 * the hole this whole change exists to close: an extractor that quietly skips
 * half its input looks identical to a quiet day on Reddit.
 */
function reconcileDispositions({ candidates, publishedIds, pendingIds, skipped }) {
  const accounted = new Set([...publishedIds, ...pendingIds, ...skipped.entries.map((e) => e.id)]);
  const unaccounted = candidates.filter((c) => !accounted.has(c.id));

  const byReason = {};
  for (const e of skipped.entries) byReason[e.reason] = (byReason[e.reason] || 0) + 1;

  // Catalog gaps are the one skip reason with a standing action attached, so
  // they come back as a list rather than a count.
  const catalogGaps = [...new Set(skipped.entries.filter((e) => e.card).map((e) => e.card))].sort();

  return { byReason, catalogGaps, unaccounted, rejected: skipped.rejected };
}

function reportDispositions(d, { candidates, published, pending }) {
  d.rejected.forEach((r) => console.log(`✗ ${r}`));

  const skippedCount = Object.values(d.byReason).reduce((a, b) => a + b, 0);
  console.log(
    `\nDispositions: ${candidates} candidate(s) — ${published} published, ${pending} pending, ` +
      `${skippedCount} skipped, ${d.unaccounted.length} unaccounted.`
  );
  for (const [reason, n] of Object.entries(d.byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)} × ${reason} — ${SKIP_REASONS[reason]}`);
  }
  if (d.catalogGaps.length > 0) {
    console.log(`\nCards seen in real data points but missing from the catalog (${d.catalogGaps.length}):`);
    d.catalogGaps.forEach((c) => console.log(`  - ${c}`));
  }
  if (d.unaccounted.length > 0) {
    console.log(
      `\nWARNING: ${d.unaccounted.length} candidate(s) were presented and never accounted for. ` +
        `They are marked seen and will not come back, so a real data point may have been lost here:`
    );
    d.unaccounted.forEach((c) => console.log(`  - ${c.id} ${c.url}`));
  }
}

// One compact row per run, appended to the state file so the skip mix can be
// read as a trend instead of one run at a time. Source failures ride along
// because a partial fetch is the difference between "quiet day" and "Reddit
// throttled us out of half the feed", and that distinction is invisible in the
// candidate count alone.
function buildRunEntry({ staged, d, published, pending }) {
  const fetched = staged.run || {};
  return {
    id: fetched.id || `${TODAY}-unknown`,
    date: TODAY,
    candidates: fetched.candidates ?? 0,
    revisits: fetched.revisits ?? 0,
    sourcesOk: fetched.sourcesOk ?? 0,
    sourcesFailed: fetched.sourcesFailed ?? 0,
    published,
    pending,
    unaccounted: d.unaccounted.length,
    skipped: d.byReason,
  };
}

// Keyed on the fetch phase's run id, not the date: several runs a day are now
// normal (one deep, several light), so they must each get a row. Re-running
// --phase=finish against the same staged fetch reuses that id and replaces its
// own row rather than stacking a second, partial one on top.
function appendRun(runs, entry) {
  const kept = (Array.isArray(runs) ? runs : []).filter((r) => r && (r.id ? r.id !== entry.id : r.date !== entry.date));
  return [...kept, entry].slice(-RUN_LOG_LIMIT);
}

// ── Phases ───────────────────────────────────────────────────────────────────

async function phaseFetch() {
  console.log(`=== Reddit Data Points — fetch phase (${TODAY}) ===\n`);

  const cards = loadCardCatalog();
  if (cards.length < 50) throw new Error(`only ${cards.length} cards loaded from data/cards/ — checkout looks broken`);
  const state = loadState();
  const importedIds = loadImportedSourceIds();
  const seenIds = new Set([...Object.keys(state.seen), ...importedIds]);

  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  fs.mkdirSync(PROPOSED_DIR, { recursive: true });
  fs.mkdirSync(PENDING_DIR, { recursive: true });

  // Age out pending entries before spending anything on them. Reported rather
  // than dropped quietly: "we chased this three times and never got the score"
  // is the signal that it is worth asking by hand, and it is the only moment
  // the entry is ever mentioned again.
  const pending = {};
  const expired = [];
  for (const [id, entry] of Object.entries(state.pending)) {
    const reason = pendingExpiry(entry);
    if (reason) expired.push({ id, entry, reason });
    else pending[id] = { ...entry };
  }
  if (expired.length > 0) {
    console.log(`\nPending expired (${expired.length}):`);
    for (const { entry, reason } of expired) {
      const known = [entry.card_name, entry.result].filter(Boolean).join(' ') || 'outcome';
      console.log(`  - ${known}, missing ${(entry.missing || []).join('/')} — ${reason}`);
      console.log(`    ${entry.url}`);
    }
  }

  const fetchers = [
    ['r/CreditCards new', () => fetchNewPosts(seenIds)],
    ['r/CreditCards megathread', () => fetchMegathreadComments(seenIds)],
  ];

  const all = [];
  const sourceStatus = [];
  let failures = 0;
  for (const [name, fn] of fetchers) {
    try {
      const { label, candidates } = await fn();
      sourceStatus.push(`  ✓ ${label}: ${candidates.length} candidate(s)`);
      all.push(...candidates);
    } catch (err) {
      failures++;
      sourceStatus.push(`  ✗ ${name} FAILED: ${err.message.split('\n')[0]}`);
    }
  }
  console.log('Sources:');
  sourceStatus.forEach((s) => console.log(s));

  const fresh = all.slice(0, CAPS.totalCandidates);
  if (all.length > fresh.length) {
    // Not marked seen (only presented candidates are), so these come back on
    // the next run rather than being lost — but a cap that bites every day is a
    // cap that needs raising, and that is invisible unless it says so.
    console.log(
      `\nNOTE: ${all.length} candidates found, presenting ${fresh.length} (CAPS.totalCandidates). ` +
        `The other ${all.length - fresh.length} were not marked seen and will be offered again next run.`
    );
  }

  // One shared request budget for everything that reads a comment feed.
  // Revisits draw first: each targets a known outcome missing one named field,
  // where expansion of a fresh post is a guess that it has replies worth having.
  const budget = createReplyBudget();

  const revisited = Object.keys(pending).length > 0 ? await revisitPending(pending, budget) : { attempted: 0, candidates: [] };
  if (revisited.attempted > 0) {
    console.log(`\nPending revisits: re-read ${revisited.candidates.length}/${revisited.attempted} post(s)`);
  }

  // Revisits come from `pending`, never from the feeds (their ids are already in
  // `seen`), so they cannot collide with a fresh candidate. Belt and braces
  // anyway: a duplicate id would break the finish phase's candidate lookup.
  const seenInBatch = new Set(revisited.candidates.map((c) => c.id));
  const candidates = [...revisited.candidates, ...fresh.filter((c) => !seenInBatch.has(c.id))];

  // Pull OP replies before the state is staged: replies are context hung off an
  // existing candidate, never candidates of their own, so this changes nothing
  // about dedupe.
  if (fresh.some((c) => c.kind === 'post')) {
    const { attempted, expanded, failures, throttled } = await expandOpReplies(fresh, budget);
    console.log(
      `\nOP replies: expanded ${expanded}/${attempted} post(s)` +
        (failures ? `, ${failures} feed(s) failed` : '') +
        (throttled ? `, ${throttled} × 61s 429 backoff` : '')
    );
  }

  fs.writeFileSync(CANDIDATES_FILE, JSON.stringify(candidates, null, 1));

  // Stage the seen-state update: every candidate presented this run counts as
  // seen. The publish script pushes this to main only after a successful run,
  // so a run that dies mid-extraction re-presents its candidates tomorrow.
  const cutoff = new Date(Date.now() - STATE_RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
  const seen = {};
  for (const [id, date] of Object.entries(state.seen)) {
    if (date >= cutoff) seen[id] = date;
  }
  for (const c of candidates) seen[c.id] = TODAY;
  // Pending is staged as-is (attempt counters already bumped by the revisit).
  // The finish phase is what resolves and re-declares entries, because only it
  // knows which ones produced a data point.
  //
  // `run` carries this phase's half of the run-log row (what we fetched, and
  // how much of the feed we actually got). Finish folds in the extraction half
  // and appends the finished row to `runs`; it is staging state, not committed
  // state, so it never reaches .github/reddit-datapoint-state.json under this
  // key.
  const run = {
    id: new Date().toISOString(),
    candidates: candidates.length,
    revisits: revisited.candidates.length,
    sourcesOk: fetchers.length - failures,
    sourcesFailed: failures,
  };
  fs.writeFileSync(STATE_UPDATED_FILE, `${JSON.stringify({ seen, pending, runs: state.runs, run }, null, 2)}\n`);
  fs.writeFileSync(FOLLOWUPS_FILE, buildFollowups(pending));

  const prompt = buildExtractPrompt({ candidates, cards });
  fs.writeFileSync(PROMPT_FILE, prompt);

  console.log(`\nCandidates: ${candidates.length} (${revisited.candidates.length} revisit, ${candidates.length - revisited.candidates.length} new)`);
  console.log(`Extraction prompt: ${path.relative(REPO_ROOT, PROMPT_FILE)} (${(prompt.length / 1024).toFixed(0)} KB)`);
  console.log(`Write proposed data points to: ${path.relative(REPO_ROOT, PROPOSED_DIR)}/<n>.yaml`);
  console.log(`Write unpublishable near-misses to: ${path.relative(REPO_ROOT, PENDING_DIR)}/<n>.yaml`);

  if (failures === fetchers.length) {
    console.log('\nWARNING: every source failed — network problem or Reddit blocking, not a quiet day.');
    process.exitCode = 2;
  }
}

function phaseFinish() {
  console.log(`=== Reddit Data Points — finish phase (${TODAY}) ===\n`);

  if (!fs.existsSync(PROPOSED_DIR)) {
    console.error('No .reddit-dp-work/proposed/ directory — run --phase=fetch first.');
    process.exit(1);
  }
  const cards = loadCardCatalog();
  const cardByName = new Map(cards.map((c) => [c.name, c]));
  const aliasToName = new Map();
  for (const c of cards) {
    for (const alias of c.previous_names) {
      if (!cardByName.has(alias)) aliasToName.set(alias, c.name);
    }
  }
  const candidates = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'));
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const importedRecords = loadImportedDataPoints();
  const importedIds = new Set(importedRecords.map((dp) => String(dp.source_id).replace(/#\d+$/, '')));
  const usedSourceIds = new Set();
  // Grows as rows are accepted, so a batch is checked against itself too.
  const priorRecords = [...importedRecords];

  const files = fs.readdirSync(PROPOSED_DIR).filter((f) => /\.ya?ml$/.test(f));
  const pendingResult = reconcilePending({ candidateById, cardByName, aliasToName });
  const skipped = loadSkipped(candidateById);

  // Accounting runs on the zero-proposed path too, and that is the case it
  // exists for: "15 candidates, 0 data points" is precisely the run where the
  // reason for each drop is the only output worth having.
  const finishAccounting = (written) => {
    const publishedIds = written.map(({ dp }) => String(dp.source_id).replace(/#\d+$/, ''));
    resolvePendingFor(pendingResult, publishedIds);
    const pendingIds = Object.keys(pendingResult.pending);
    const dispositions = reconcileDispositions({ candidates, publishedIds, pendingIds, skipped });
    const runEntry = buildRunEntry({
      staged: pendingResult.staged,
      d: dispositions,
      published: written.length,
      pending: pendingIds.length,
    });
    reportPending(pendingResult, appendRun(pendingResult.staged.runs, runEntry));
    reportDispositions(dispositions, {
      candidates: candidates.length,
      published: written.length,
      pending: pendingIds.length,
    });
    return dispositions;
  };

  if (files.length === 0) {
    console.log('No proposed data points — nothing to publish. (Quiet days end here; that is success.)');
    finishAccounting([]);
    return;
  }

  fs.mkdirSync(DATAPOINTS_DIR, { recursive: true });
  const written = [];
  let failed = 0;
  for (const file of files) {
    let dp;
    try {
      dp = yaml.load(fs.readFileSync(path.join(PROPOSED_DIR, file), 'utf8'));
    } catch (err) {
      console.log(`✗ ${file}: unparseable YAML (${err.message.split('\n')[0]})`);
      failed++;
      continue;
    }
    if (!dp || typeof dp !== 'object') {
      console.log(`✗ ${file}: empty or not a mapping`);
      failed++;
      continue;
    }
    const { errors, warnings } = validateDataPoint(dp, {
      candidateById,
      cardByName,
      aliasToName,
      usedSourceIds,
      importedIds,
      priorRecords,
    });
    if (errors.length) {
      console.log(`✗ ${file}: ${errors.join('; ')}`);
      failed++;
      continue;
    }
    warnings.forEach((w) => console.log(`  ! ${file}: ${w}`));
    const filename = writeDataPointFile(dp);
    if (filename) {
      usedSourceIds.add(dp.source_id);
      priorRecords.push(dp);
      written.push({ dp, filename });
    }
  }

  // A published row retires its pending entry — that is the bucket working.
  const dispositions = finishAccounting(written);

  if (written.length > 0) {
    fs.writeFileSync(PR_BODY_FILE, buildPrBody(written, pendingResult.pending, dispositions));
    console.log(`\nPR body: ${path.relative(REPO_ROOT, PR_BODY_FILE)}`);
  }
  console.log(`${written.length} data point(s) written to data/reddit-datapoints/, ${failed} rejected.`);
  if (failed > 0) {
    console.log('Fix the rejected files in .reddit-dp-work/proposed/ and re-run --phase=finish, or drop them.');
  }
  if (written.length === 0 && failed > 0) process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const phaseArg = process.argv.find((a) => a.startsWith('--phase='));
  const phase = phaseArg ? phaseArg.split('=')[1] : null;
  if (phase === 'fetch') return phaseFetch();
  if (phase === 'finish') return phaseFinish();

  console.error('Usage: node scripts/check-reddit-datapoints.js --phase=fetch|finish');
  console.error('The extraction step between the phases runs in the Claude Code session (see the reddit-datapoints-local scheduled task).');
  process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}

module.exports = {
  parseAtom,
  looksLikeSameApplication,
  hasPlausibleScore,
  rankForExpansion,
  fetchOpReplies,
  fetchPostSnapshot,
  expandOpReplies,
  createReplyBudget,
  revisitPending,
  pendingExpiry,
  rankPending,
  validatePendingEntry,
  mergePending,
  buildFollowups,
  buildExtractPrompt,
  buildPrBody,
  validateDataPoint,
  getRateLimitBackoffs,
  loadSkipped,
  reconcileDispositions,
  buildDispositionSection,
  appendRun,
  buildRunEntry,
  fetchNewPosts,
  SKIP_REASONS,
  RUN_LOG_LIMIT,
  NEW_FEED_PAGES,
  CAPS,
  PENDING_MAX_DAYS,
  PENDING_MAX_ATTEMPTS,
};
