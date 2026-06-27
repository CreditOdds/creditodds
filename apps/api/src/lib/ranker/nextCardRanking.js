// Marginal "best card for me" rewards engine.
//
// Shares the category-matching and valuation primitives with storeRanking.js
// so a card's earn rate is computed exactly the way the wallet/store pages
// compute it (rotating categories, point valuations, co-brand merchant gates).
//
// Models the wallet as a set of CARDS (duplicates allowed) and computes what
// each spend category actually earns, accounting for:
//   - direct (always-on) category bonuses,
//   - flexible single-category bonuses (Custom Cash top-category, rotating,
//     user-choice) allocated to wherever they add the most value,
//   - per-reward spend caps (so a $500/mo 5% cap earns 5% on the first $6k/yr
//     and the base rate beyond it), and
//   - MULTIPLE copies of the same card stacking their caps (two Custom Cash
//     cards earn 5% on the first $1,000/mo of the top category).
//
// A candidate card's value is the difference between what the wallet earns
// with it and without it, per category. Plain CommonJS, consumed by the
// Next.js frontend through the `@ranker/*` alias.

const { findCategoryMatch, effectiveCashbackRate } = require("./storeRanking");

const SPEND_CATEGORY_MAP = {
  dining: ["dining"],
  groceries: ["groceries"],
  gas: ["gas"],
  // Flights vs hotels are separate buckets. A generic "travel" reward (earns on
  // all travel) maps to BOTH; airline rates go to flights, hotel/car-rental
  // rates go to hotels.
  flights: ["travel", "airlines"],
  hotels: ["travel", "hotels", "car_rentals"],
  transit: ["transit", "ground_transportation"],
  online_shopping: ["online_shopping"],
  streaming: ["streaming", "tv_internet_streaming"],
  everything_else: ["everything_else"],
};

const SPEND_BUCKETS = Object.keys(SPEND_CATEGORY_MAP);

// Buckets whose spend is brand-loyalty-sensitive (a co-brand card's elevated
// rate is tied to one airline/hotel).
const TRAVEL_BUCKETS = new Set(["flights", "hotels"]);

// Single-category bonus modes the user CONTROLS: an auto top-spend category
// (Custom Cash) or a category they choose (Cash+). These are allocated to one
// bucket. Quarterly-rotating modes are deliberately excluded — the user can't
// control which category is active, so we don't credit (or show) a rotating
// card for a category just because it's this quarter's pick.
const FLEXIBLE_MODES = new Set(["user_choice", "user_selected", "top_spend"]);

// Issuer-rotated reward modes we never count: the active category changes each
// quarter/month and isn't in the user's control.
const ROTATING_MODES = new Set(["rotating_current", "rotating_eligible"]);

// Portal-dependent reward categories (travel_portal, hotels_portal, …) only
// earn when booked through the issuer portal, so they're excluded from general
// spend and from the card's displayed earn categories. The `_portal` suffix is
// the catalog's convention for this (mirrors lib/cardDisplayUtils).
function isPortalCategory(category) {
  return typeof category === "string" && category.endsWith("_portal");
}

function flatRateEff(card) {
  const r = (card.rewards || []).find((x) => x.category === "everything_else");
  if (!r) return 0;
  return effectiveCashbackRate(r.value, r.unit, card.card_name);
}

function capAnnual(reward) {
  if (!reward.spend_cap || !reward.cap_period) return Infinity;
  const mult =
    reward.cap_period === "monthly" ? 12 : reward.cap_period === "quarterly" ? 4 : 1;
  return reward.spend_cap * mult;
}

// Loyalty programs the quiz collects, with the card-name keywords and the
// reward merchant_gate store slugs that identify a co-brand card for the brand.
const LOYALTY_BRANDS = {
  delta: { keywords: ["delta"], stores: ["delta-air-lines", "delta"] },
  united: { keywords: ["united"], stores: ["united-airlines", "united"] },
  american: { keywords: ["american airlines", "aadvantage"], stores: ["american-airlines"] },
  southwest: { keywords: ["southwest"], stores: ["southwest-airlines", "southwest"] },
  jetblue: { keywords: ["jetblue"], stores: ["jetblue", "jetblue-airways"] },
  alaska: { keywords: ["alaska"], stores: ["alaska-airlines"] },
  marriott: { keywords: ["marriott", "bonvoy"], stores: ["marriott"] },
  hilton: { keywords: ["hilton"], stores: ["hilton"] },
  hyatt: { keywords: ["hyatt"], stores: ["hyatt"] },
  ihg: { keywords: ["ihg"], stores: ["ihg"] },
};

// The YAML reward categories that make up the "travel" spend bucket.
const TRAVEL_CATEGORIES = new Set(["travel", "airlines", "hotels", "car_rentals"]);

// Does this card belong to one of the user's loyalty brands? (a co-brand card
// for an airline/hotel they're loyal to).
function cardMatchesLoyalty(card, allegiances) {
  if (!allegiances || allegiances.length === 0) return false;
  const name = (card.card_name || "").toLowerCase();
  for (const a of allegiances) {
    const brand = LOYALTY_BRANDS[a];
    if (!brand) continue;
    if (brand.keywords.some((k) => name.includes(k))) return true;
    for (const r of card.rewards || []) {
      if (r.merchant_gate && r.merchant_gate.some((g) => brand.stores.includes(g))) return true;
    }
  }
  return false;
}

// The store slug a card's travel reward is gated to (for findCategoryMatch).
function travelGateSlug(card) {
  for (const r of card.rewards || []) {
    if (TRAVEL_CATEGORIES.has(r.category) && r.merchant_gate && r.merchant_gate.length) {
      return r.merchant_gate[0];
    }
  }
  return null;
}

// The bonus offers a single card contributes: direct (always-on, fixed bucket)
// and flexible (one of several eligible buckets). Each carries its cap and the
// card name (so the analysis table can attribute the rate to a card).
//
// Travel is special: a co-brand card's elevated rate is tied to ONE airline or
// hotel (merchant_specific, e.g. Choice Privileges' 10x at Choice Hotels, or
// merchant_gate, e.g. United Gateway's 2x at United). We assume the user's
// travel dollars go to the brand(s) they're loyal to, so those brand-specific
// rates only count when the card matches a selected loyalty. Generic travel
// rates (earn on all travel) always count.
function cardOffers(card, allegiances) {
  const baseEff = flatRateEff(card);
  const direct = [];
  const flexRaw = [];
  const loyaltyMatch = cardMatchesLoyalty(card, allegiances);
  const gateSlug = loyaltyMatch ? travelGateSlug(card) : null;
  for (const bucket of SPEND_BUCKETS) {
    if (bucket === "everything_else") continue;
    const isTravel = TRAVEL_BUCKETS.has(bucket);
    const includeMerchantSpecific = isTravel ? loyaltyMatch : true;
    const storeSlug = isTravel ? gateSlug : null;
    const m = findCategoryMatch(
      card,
      SPEND_CATEGORY_MAP[bucket],
      storeSlug,
      includeMerchantSpecific,
      null,
    );
    if (!m || ROTATING_MODES.has(m.mode)) continue;
    const eff = effectiveCashbackRate(m.reward.value, m.reward.unit, card.card_name);
    if (eff <= baseEff) continue;
    const offer = { bucket, eff, cap: capAnnual(m.reward), cardName: card.card_name, reward: m.reward };
    if (FLEXIBLE_MODES.has(m.mode)) flexRaw.push(offer);
    else direct.push(offer);
  }
  // One flexible reward can match several buckets — collapse to a single
  // choice with the full list of eligible buckets.
  const byReward = new Map();
  for (const f of flexRaw) {
    if (!byReward.has(f.reward)) {
      byReward.set(f.reward, { eff: f.eff, cap: f.cap, cardName: f.cardName, eligible: [] });
    }
    byReward.get(f.reward).eligible.push(f.bucket);
  }
  return { baseEff, direct, flexible: [...byReward.values()] };
}

// Dollars earned in a bucket given annual spend, a base rate, and a set of
// capped bonus offers. Fills the highest rate first up to its cap, then the
// next, with any remainder at the base rate.
function bucketEarn(spend, baseEff, offers, baseCard) {
  const sorted = offers.filter((o) => o.eff > baseEff).sort((a, b) => b.eff - a.eff);
  let remaining = spend;
  let earned = 0;
  // The spend "layers": each chunk of spend and the rate/card that earns it,
  // highest rate first. Exposes what catches spend after a card's cap is hit
  // (e.g. the second $500/mo of Custom Cash dining falls to the next card).
  const segments = [];
  for (const o of sorted) {
    if (remaining <= 0) break;
    const amt = Math.min(remaining, o.cap);
    if (amt <= 0) continue;
    earned += (amt * o.eff) / 100;
    segments.push({ rate: o.eff, amount: amt, card: o.cardName });
    remaining -= amt;
  }
  if (remaining > 0) {
    earned += (remaining * baseEff) / 100;
    // The base/flat rate is provided by a card too (e.g. a 2% Active Cash), so
    // attribute it instead of showing "no bonus".
    segments.push({ rate: baseEff, amount: remaining, card: baseCard || null });
  }
  return {
    earned,
    topRate: sorted.length ? sorted[0].eff : baseEff,
    topCard: sorted.length ? sorted[0].cardName : baseCard || null,
    segments,
  };
}

// Total earnings for a wallet (cards, duplicates allowed), allocating each
// flexible bonus greedily to the bucket where it adds the most value.
// `allegiances` (loyalty program keys) gate co-brand travel rates (see cardOffers).
function walletEarnings(cards, spend, allegiances) {
  // The base/flat rate is the best "everything else" rate in the wallet, and
  // the card that provides it (so the table can name a 2% Active Cash, etc.).
  let baseEff = 0;
  let baseCard = null;
  for (const card of cards) {
    const f = flatRateEff(card);
    if (f > baseEff) {
      baseEff = f;
      baseCard = card.card_name;
    }
  }

  const directByBucket = {};
  for (const b of SPEND_BUCKETS) directByBucket[b] = [];
  const flexible = [];
  for (const card of cards) {
    const offers = cardOffers(card, allegiances);
    for (const d of offers.direct) directByBucket[d.bucket].push(d);
    for (const f of offers.flexible) flexible.push(f);
  }

  const assignedByBucket = {};
  for (const b of SPEND_BUCKETS) assignedByBucket[b] = [];

  // Assign each flexible bonus to the bucket where it adds the most value,
  // MOST-CONSTRAINED FIRST (fewest productive eligible buckets, then highest
  // rate). Processing the narrowly-eligible bonuses first stops a broad bonus
  // from grabbing a shared bucket and stranding a bonus that can only earn
  // there. The deterministic ordering also makes the result independent of the
  // order cards were listed in.
  const productive = (f) => f.eligible.filter((b) => (spend[b] || 0) > 0).length;
  const ordered = flexible.slice().sort((a, b) => productive(a) - productive(b) || b.eff - a.eff);
  for (const f of ordered) {
    let bestGain = 1e-9;
    let bestBucket = null;
    for (const bucket of f.eligible) {
      const s = spend[bucket] || 0;
      if (s <= 0) continue;
      const current = [...directByBucket[bucket], ...assignedByBucket[bucket]];
      const before = bucketEarn(s, baseEff, current).earned;
      const after = bucketEarn(s, baseEff, [...current, f]).earned;
      const gain = after - before;
      if (gain > bestGain) {
        bestGain = gain;
        bestBucket = bucket;
      }
    }
    if (bestBucket) assignedByBucket[bestBucket].push(f);
  }

  const perBucket = {};
  let total = 0;
  for (const bucket of SPEND_BUCKETS) {
    const s = spend[bucket] || 0;
    const offers = [...directByBucket[bucket], ...assignedByBucket[bucket]];
    const { earned, topRate, topCard, segments } = bucketEarn(s, baseEff, offers, baseCard);
    perBucket[bucket] = { spend: s, earned, topRate, topCard, segments };
    total += earned;
  }
  return { perBucket, total, baseEff };
}

// What a candidate adds on top of the current wallet, per category. `base` is
// walletEarnings(owned, spend, allegiances), passed in so it is computed once.
function recommendationBreakdown(candidate, owned, spend, base, allegiances) {
  const withCard = walletEarnings([...owned, candidate], spend, allegiances);
  const categories = [];
  for (const bucket of SPEND_BUCKETS) {
    const s = spend[bucket] || 0;
    if (s <= 0) continue;
    const before = base.perBucket[bucket];
    const after = withCard.perBucket[bucket];
    const delta = after.earned - before.earned;
    categories.push({
      category: bucket,
      spend: s,
      currentRate: before.topRate,
      currentCard: before.topCard,
      currentEarned: before.earned,
      newRate: after.topRate,
      newEarned: after.earned,
      delta,
      helps: delta > 0.5,
    });
  }
  const rewardsValue = withCard.total - base.total;
  const winningCategories = categories
    .filter((c) => c.helps)
    .sort((a, b) => b.delta - a.delta)
    .map((c) => ({
      category: c.category,
      rate: c.newRate,
      priorRate: c.currentRate,
      annualValue: c.delta,
    }));
  return { rewardsValue, winningCategories, categories };
}

module.exports = {
  SPEND_CATEGORY_MAP,
  SPEND_BUCKETS,
  isPortalCategory,
  flatRateEff,
  cardOffers,
  bucketEarn,
  walletEarnings,
  recommendationBreakdown,
};
