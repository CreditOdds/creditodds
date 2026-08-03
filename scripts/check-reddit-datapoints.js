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

const CAPS = {
  newPosts: 40,
  threadComments: 60,
  bodyChars: 2500,
  totalCandidates: 60,
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
  const empty = { seen: {}, pending: {} };
  try {
    if (!fs.existsSync(STATE_FILE)) return empty;
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!parsed || typeof parsed.seen !== 'object') return empty;
    // `pending` postdates `seen`; a state file written before it existed is
    // valid and just has an empty bucket.
    return { seen: parsed.seen, pending: parsed.pending && typeof parsed.pending === 'object' ? parsed.pending : {} };
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

async function fetchNewPosts(seenIds) {
  const entries = parseAtom(await redditRss('https://www.reddit.com/r/CreditCards/new/.rss?limit=100'));
  const kept = entries
    .filter((p) => !seenIds.has(p.id))
    .filter((p) => DP_SIGNAL_RE.test(`${p.title} ${p.content}`))
    .slice(0, CAPS.newPosts);
  return {
    label: 'r/CreditCards new posts',
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

## Card catalog (output card_name exactly as listed)
${buildCardListSection(cards)}
${buildRevisitSection(revisits)}
## New candidates (${fresh.length})

${numbered}

If nothing qualifies, create no files — that is a successful run. Either way, end your run report with data-point counts, pending entries opened or resolved, and any catalog-missing cards you saw.
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

function buildPrBody(written, pending) {
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
${buildPendingSection(pending)}
### What merging does
\`sync-datapoints.yml\` invokes the \`creditodds-import-reddit-records\` Lambda, which inserts the accepted rows into the \`records\` table (submitter_id \`reddit:<source_id>\`, so imports are distinguishable and idempotent). Card stats refresh within ~5 minutes; CloudFront/ISR caching means public pages update within ~10.
`;
}

// ── Pending reconciliation (finish phase) ────────────────────────────────────

// The staged state is the fetch phase's output, so finish has to read it back,
// fold in what the session decided, and rewrite it. Anything the session did NOT
// re-declare falls out of the bucket: silence means "stop chasing this".
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

  return { staged, pending: declared, rejected, carriedCount: Object.keys(carried).length };
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
function reportPending(result) {
  const { staged, pending, rejected, resolved = 0 } = result;
  fs.writeFileSync(STATE_UPDATED_FILE, `${JSON.stringify({ seen: staged.seen || {}, pending }, null, 2)}\n`);
  fs.writeFileSync(FOLLOWUPS_FILE, buildFollowups(pending));

  rejected.forEach((r) => console.log(`✗ pending/${r}`));

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
  fs.writeFileSync(STATE_UPDATED_FILE, `${JSON.stringify({ seen, pending }, null, 2)}\n`);
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
  if (files.length === 0) {
    console.log('No proposed data points — nothing to publish. (Quiet days end here; that is success.)');
    reportPending(pendingResult);
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
  resolvePendingFor(pendingResult, written.map(({ dp }) => String(dp.source_id).replace(/#\d+$/, '')));
  reportPending(pendingResult);

  if (written.length > 0) {
    fs.writeFileSync(PR_BODY_FILE, buildPrBody(written, pendingResult.pending));
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
  buildFollowups,
  buildExtractPrompt,
  buildPrBody,
  validateDataPoint,
  getRateLimitBackoffs,
  CAPS,
  PENDING_MAX_DAYS,
  PENDING_MAX_ATTEMPTS,
};
