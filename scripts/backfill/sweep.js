// Year-long r/CreditCards data-point candidate sweep.
//
// Why this is shaped the way it is: Reddit search returns at most ~250 results
// per query no matter the time range, and the cloudsearch `timestamp:a..b`
// syntax that used to allow exhaustive time-window slicing is gone (verified
// 2026-07-30: returns 0 entries). So reaching back a year requires PARTITIONING
// the query space until each partition fits under the depth cap:
//
//   1. flair:Data-Point, paginated — the densest source, self-declared DPs.
//   2. One query per catalog card name — partitions by card, so each slice is
//      small enough to reach back further than a broad query ever could.
//
// Candidates are cached and NOT marked seen. Marking the whole year seen up
// front would burn every candidate we haven't extracted yet, since the routine
// never re-proposes a seen id. Extraction batches mark only what they process.

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const REPO = path.join(__dirname, '..', '..');
const { parseAtom, hasPlausibleScore } = require(path.join(REPO, 'scripts/check-reddit-datapoints.js'));

const CUTOFF = '2020-07-30';          // six years back (Max, 2026-07-30)
const OUT = path.join(__dirname, 'candidate-cache.json');
const PROGRESS = path.join(__dirname, 'sweep-progress.log');
const SPACING_MS = 12000;
const BACKOFF_MS = 61000;
const MAX_PAGES_FLAIR = 3;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUTCOME_RE = /(approved|denied|rejected|instant.{0,12}(approval|decision)|got (the card|approved|denied))/i;

let reqs = 0, backoffs = 0, fails = 0;
function log(line) {
  console.log(line);
  fs.appendFileSync(PROGRESS, line + '\n');
}

async function get(url, retried = 0) {
  reqs++;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/atom+xml,application/xml,text/xml,*/*' } });
  if (res.status === 429 && retried < 2) {
    backoffs++;
    await sleep(BACKOFF_MS);
    return get(url, retried + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseAtom(await res.text());
}

const search = (q, extra = '') =>
  `https://www.reddit.com/r/CreditCards/search.rss?restrict_sr=1&sort=new&t=all&limit=100&q=${encodeURIComponent(q)}${extra}`;

const truncate = (t, n) => { const c = (t || '').replace(/\s+/g, ' ').trim(); return c.length > n ? `${c.slice(0, n)}…` : c; };

function loadCardNames() {
  const dir = path.join(REPO, 'data', 'cards');
  const names = [];
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
    try {
      const c = yaml.load(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (c && c.name) names.push(c.name);
    } catch { /* skip */ }
  }
  return names;
}

const byId = new Map();
function consider(e, source) {
  if (!e.id || byId.has(e.id)) return false;
  if (e.updated && e.updated < CUTOFF) return false;
  const body = `${e.title} ${e.content}`;
  // Both gates, same as the monthly sweep: a post with no stated outcome or no
  // FICO-range number can never become a data point.
  if (!OUTCOME_RE.test(body) || !hasPlausibleScore(body)) return false;
  byId.set(e.id, {
    id: e.id, kind: 'post',
    title: truncate(e.title, 200),
    text: truncate(e.content, 2500),
    url: e.link,
    posted: e.updated || CUTOFF,
    found_via: source,
  });
  return true;
}

function save() {
  const all = [...byId.values()].sort((a, b) => b.posted.localeCompare(a.posted));
  fs.writeFileSync(OUT, JSON.stringify({
    cutoff: CUTOFF, generated_for: 'year sweep', requests: reqs, backoffs, failures: fails,
    span: all.length ? { oldest: all[all.length - 1].posted, newest: all[0].posted } : null,
    candidates: all,
  }, null, 1));
}

(async () => {
  fs.writeFileSync(PROGRESS, '');
  // Seed from whatever a previous run already cached. Two reasons: the cache is
  // the batcher's input while this runs, so starting empty would make the pool
  // visibly shrink mid-sweep; and re-finding what we already have is wasted
  // requests against an API that is throttling ~44% of them.
  let seeded = 0;
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    for (const c of prev.candidates || []) { byId.set(c.id, c); seeded++; }
  } catch { /* no prior cache */ }
  log(`Sweep: ${CUTOFF} .. today (t=all). Seeded ${seeded} candidates from the previous run.`);

  // ── Phase 1: the Data Point flair, paginated to the depth cap.
  let after = null, oldest = null;
  for (let page = 1; page <= MAX_PAGES_FLAIR; page++) {
    let e;
    try { e = await get(search('flair:Data-Point', after ? `&count=${(page - 1) * 100}&after=${after}` : '')); }
    catch (err) { fails++; log(`  flair page ${page} FAILED (${err.message})`); break; }
    if (!e.length) break;
    let kept = 0;
    for (const x of e) if (consider(x, 'flair')) kept++;
    oldest = e[e.length - 1].updated;
    after = e[e.length - 1].id;
    log(`  flair page ${page}: ${e.length} results, oldest ${oldest}, +${kept} candidates (total ${byId.size})`);
    if (oldest && oldest < CUTOFF) break;
    await sleep(SPACING_MS);
  }
  save();
  log(`Phase 1 done: ${byId.size} candidates, flair reached back to ${oldest}`);

  // ── Phase 2: one query per catalog card. Partitioning by card is what gets us
  // past the depth cap — most individual cards have far fewer than 250 mentions
  // in a year, so each query can reach the full range.
  const cards = loadCardNames();
  log(`\nPhase 2: ${cards.length} card-name queries (this is the long part)`);
  let i = 0, capped = 0;
  for (const name of cards) {
    i++;
    await sleep(SPACING_MS);
    let e;
    try { e = await get(search(`"${name}"`)); }
    catch (err) { fails++; log(`  [${i}/${cards.length}] ${name}: FAILED (${err.message})`); continue; }
    let kept = 0;
    for (const x of e) if (consider(x, `card:${name}`)) kept++;
    const cardOldest = e.length ? e[e.length - 1].updated : null;
    // 100 results and still not past the cutoff means this card's slice is
    // itself depth-capped and its older posts are unreachable this way. Logged
    // rather than silently accepted, so the coverage gap is visible.
    const hitCap = e.length >= 100 && cardOldest && cardOldest > CUTOFF;
    if (hitCap) capped++;
    if (kept || hitCap) {
      log(`  [${i}/${cards.length}] ${name}: ${e.length} results, oldest ${cardOldest}, +${kept}${hitCap ? '  ** DEPTH-CAPPED **' : ''} (total ${byId.size})`);
    }
    if (i % 20 === 0) { save(); log(`  ... saved at ${i}/${cards.length}, ${byId.size} candidates, ${reqs} reqs, ${backoffs} backoffs`); }
  }

  save();
  const all = [...byId.values()];
  log(`\n=== DONE ===`);
  log(`Candidates: ${all.length}`);
  log(`Span: ${all.length ? `${all[all.length - 1].posted} .. ${all[0].posted}` : 'none'}`);
  log(`Requests: ${reqs}, 429 backoffs: ${backoffs}, failures: ${fails}`);
  log(`Cards whose own slice was depth-capped (older posts unreachable): ${capped}`);
  log(`Cached to ${OUT} — nothing marked seen yet.`);
})();
