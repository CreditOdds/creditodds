/**
 * Shared logic for the twice-weekly r/creditodds "<card> approval odds?" post.
 *
 * One card per run, picked as the highest-record card that has not been posted
 * before. The rotation deliberately does NOT loop: every eligible card gets
 * exactly one post, and when the queue is empty the run is a no-op until new
 * cards cross the record floor. Records accumulate over time, so the queue
 * refills itself.
 *
 * Why a record floor at all: at the time this was written 175 of 209 cards had
 * fewer than 5 data points. Publishing "approval odds" off 3 records would be
 * a number nobody should act on, and the post exists to earn trust and pull in
 * more data points, not to hit a cadence.
 */

// Reuses the roundup lib's retry wrapper (5xx/429 with exponential backoff)
// rather than adding a second copy; that module is already the shared home for
// this repo's social-post plumbing.
const { fetchWithRetry } = require('./weekly-sub-changes');

const API_BASE = process.env.CREDITODDS_API_BASE || 'https://d2ojrhbh2dincr.cloudfront.net';
const SITE_BASE = 'https://creditodds.com';

/** Below this many records the odds are not worth publishing. */
const MIN_RECORDS = 10;

/** `records.result` in the API: 1 approved, 0 denied. Nothing else is emitted. */
const RESULT_APPROVED = 1;
const RESULT_DENIED = 0;

/**
 * Every `credit_score_source` value the submit form offers is a FICO variant
 * (0 unspecified, 1 Experian, 2 TransUnion, 3 Equifax), so labelling the
 * aggregate "FICO" is accurate and needs no per-record filtering.
 */
function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Pull one numeric field off the records that actually carry it. Optional
 * fields are sparse (income was present on 22 of 42 records on the card this
 * was built against), so every stat reports its own n rather than implying the
 * whole sample answered.
 */
function summarize(records, field) {
  const values = records
    .map(r => r[field])
    .filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0);
  return { median: median(values), n: values.length };
}

async function fetchJson(url) {
  const res = await fetchWithRetry(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

/** Cache-bust the 300s CloudFront TTL so a run never reads yesterday's counts. */
function bust(url) {
  return `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`;
}

async function fetchCards() {
  return fetchJson(bust(`${API_BASE}/cards`));
}

async function fetchCardRecords(cardName) {
  return fetchJson(bust(`${API_BASE}/card-records?card_name=${encodeURIComponent(cardName)}`));
}

/**
 * Eligible = enough data to be worth publishing, still applicable for, and not
 * already posted.
 *
 * Closed cards are excluded because the post asks "should you apply?" and links
 * to a page that cannot take an application. Their data points are still
 * valuable, they are just not the subject of this post.
 */
function selectCard(cards, postedSlugs, { minRecords = MIN_RECORDS } = {}) {
  const eligible = cards.filter(c =>
    (c.total_records || 0) >= minRecords &&
    c.accepting_applications !== false &&
    c.slug &&
    !postedSlugs.has(c.slug)
  );
  if (eligible.length === 0) return null;
  // Ties broken by name so a rerun with unchanged data picks the same card.
  eligible.sort((a, b) =>
    (b.total_records || 0) - (a.total_records || 0) ||
    String(a.card_name || a.name).localeCompare(String(b.card_name || b.name))
  );
  return eligible[0];
}

function cardPageUrl(slug, campaign) {
  const url = new URL(`${SITE_BASE}/card/${slug}`);
  url.searchParams.set('utm_source', 'reddit');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', campaign);
  url.searchParams.set('utm_content', new Date().toISOString().slice(0, 10));
  return url.toString();
}

function formatMoney(value) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/**
 * Split the records into the two outcomes and reduce each side to the stats
 * worth printing. Denied-side medians are computed here rather than read from
 * `card_stats`, which only stores the approved side.
 */
function computeStats(records) {
  const approved = records.filter(r => r.result === RESULT_APPROVED);
  const denied = records.filter(r => r.result === RESULT_DENIED);
  const counted = approved.length + denied.length;

  return {
    total: records.length,
    counted,
    approvedCount: approved.length,
    deniedCount: denied.length,
    // Rate is over decided records only; a future pending/unknown result must
    // not silently deflate the percentage.
    approvalRate: counted > 0 ? approved.length / counted : null,
    approvedScore: summarize(approved, 'credit_score'),
    deniedScore: summarize(denied, 'credit_score'),
    approvedIncome: summarize(approved, 'listed_income'),
    deniedIncome: summarize(denied, 'listed_income'),
    approvedLimit: summarize(approved, 'starting_credit_limit'),
  };
}

/**
 * Reddit body. Markdown is intentional and matches the weekly SUB roundup
 * (PR #1993): links only render if the composer is in Markdown mode, so the
 * caller prints that reminder next to the submit URL. Nothing else uses
 * markdown syntax, so the text still reads correctly if it goes out rich-text.
 *
 * No em dashes anywhere in user-facing copy.
 */
function buildPostText(card, stats, link) {
  const name = card.card_name || card.name;
  const title = `${name} approval odds?`;

  const lines = [];
  lines.push(
    `We track approval and denial data points on the [${name}](${link}). Here is what ${stats.counted} of them say so far.`
  );
  lines.push('');
  lines.push(
    `Approval rate: ${Math.round(stats.approvalRate * 100)}% (${stats.approvedCount} approved, ${stats.deniedCount} denied)`
  );

  const approvedRows = [];
  if (stats.approvedScore.median !== null) {
    approvedRows.push(`Median FICO: ${Math.round(stats.approvedScore.median)} (n=${stats.approvedScore.n})`);
  }
  if (stats.approvedIncome.median !== null) {
    approvedRows.push(`Median income: ${formatMoney(stats.approvedIncome.median)} (n=${stats.approvedIncome.n})`);
  }
  if (stats.approvedLimit.median !== null) {
    approvedRows.push(`Median starting limit: ${formatMoney(stats.approvedLimit.median)} (n=${stats.approvedLimit.n})`);
  }
  if (approvedRows.length > 0) {
    lines.push('');
    lines.push('Approved:');
    lines.push('');
    lines.push(approvedRows.join('\n'));
  }

  const denied = describeDeniedScore(stats);
  if (denied) {
    lines.push('');
    lines.push(denied);
  }

  lines.push('');
  lines.push(
    `Each number is a median over the data points that reported that field, so the n varies by row. ${samplingCaveat(stats.counted)}`
  );
  lines.push('');
  lines.push(
    'If you have applied for this card, drop your data point in the comments: approved or denied, your FICO at the time, income, and the starting limit if you got one. We will fold it into the numbers.'
  );
  lines.push('');
  lines.push(`Full data points and the odds calculator are on the card page: ${link}`);

  return `${title}\n\n${lines.join('\n')}`;
}

/**
 * How the denied side gets described.
 *
 * A bare "Approved median FICO 751 / Denied median FICO 750" table was the
 * first draft, and it is a trap: across the 15 cards eligible at launch, the
 * denied median was HIGHER than the approved median on 7 of them (Citi Strata
 * Premier: denied 815 vs approved 759). Printed without context that reads as
 * broken data and invites exactly the "your numbers are garbage" reply the post
 * is trying to avoid.
 *
 * It is not broken, it is real: denials at high scores are driven by
 * application velocity, thin files, and issuer rules rather than by score, and
 * `reason_denied` is free text present on only ~14% of denials, so it cannot be
 * aggregated to explain it. Saying so in a sentence is both honest and the most
 * comment-worthy line in the post.
 *
 * Deliberately hedged ("often", "usually"): we are describing a pattern in a
 * small self-reported sample, not asserting a cause.
 */
const SCORE_GAP_NOISE = 15;

function describeDeniedScore(stats) {
  const approved = stats.approvedScore.median;
  const denied = stats.deniedScore.median;
  if (approved === null || denied === null) return null;

  const d = Math.round(denied);
  const n = stats.deniedScore.n;
  const gap = Math.round(approved - denied);

  if (gap >= SCORE_GAP_NOISE) {
    return `Denied applicants reported a median FICO of ${d} (n=${n}), about ${gap} points below the approved group.`;
  }
  if (gap <= -SCORE_GAP_NOISE) {
    return (
      `Denied applicants reported a median FICO of ${d} (n=${n}), which is actually ${Math.abs(gap)} points ` +
      'higher than the approved group. On a sample this size that usually means denials came down to ' +
      'application velocity, a thin file, or issuer rules rather than the score itself.'
    );
  }
  return (
    `Denied applicants reported a median FICO of ${d} (n=${n}), effectively the same as the approved group. ` +
    'Score alone did not separate the two here, which often points at recent application velocity, ' +
    'income, or an existing relationship with the bank.'
  );
}

/**
 * The honesty valve. These samples are small and the post should say so in
 * proportion, rather than printing a confident percentage and moving on.
 */
function samplingCaveat(n) {
  if (n < 20) {
    return `At ${n} data points this is directional only, not a prediction.`;
  }
  if (n < 40) {
    return `At ${n} data points treat this as directional.`;
  }
  return 'It is still a self-reported sample, so treat it as directional.';
}

module.exports = {
  API_BASE,
  MIN_RECORDS,
  RESULT_APPROVED,
  RESULT_DENIED,
  median,
  summarize,
  computeStats,
  selectCard,
  cardPageUrl,
  buildPostText,
  describeDeniedScore,
  samplingCaveat,
  fetchCards,
  fetchCardRecords,
};
