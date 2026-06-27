// Marginal "best card for me" rewards engine.
//
// Shares the category-matching and valuation primitives with storeRanking.js
// so a card's earn rate is computed exactly the way the wallet/store pages
// compute it (rotating categories, point valuations, co-brand merchant gates).
//
// Plain CommonJS, consumed by the Next.js frontend through the `@ranker/*`
// alias (see apps/web-next/src/lib/nextCardRanking.ts). This module owns only
// the part that needs the ranker primitives: marginal REWARDS by spend.
// Credits, reward-type preference and the final ranking are layered in the TS
// wrapper, because credit amortization (amortizedAnnualValue) already lives on
// the frontend and there is no Lambda consumer to keep in sync.

const { findCategoryMatch, effectiveCashbackRate } = require("./storeRanking");

// A user's spend bucket can be satisfied by any of several YAML reward
// categories — "travel" spend earns on travel/airlines/hotels/car_rentals.
// Portal categories (*_portal) are intentionally excluded: they only earn when
// booked through the issuer portal, not on general spend.
const SPEND_CATEGORY_MAP = {
  dining: ["dining"],
  groceries: ["groceries"],
  gas: ["gas"],
  travel: ["travel", "airlines", "hotels", "car_rentals"],
  transit: ["transit", "ground_transportation"],
  online_shopping: ["online_shopping"],
  streaming: ["streaming", "tv_internet_streaming"],
  everything_else: ["everything_else"],
};

const SPEND_BUCKETS = Object.keys(SPEND_CATEGORY_MAP);

// Match modes that earn on ONE category at a time (the user's top/selected
// category, or the current rotation) rather than always-on. Such a bonus must
// be assigned to a single bucket, not credited across every eligible one.
const FLEXIBLE_MODES = new Set([
  "rotating_current",
  "user_choice",
  "user_selected",
  "top_spend",
]);

// Effective cents-per-dollar of a card's flat "everything else" reward.
function flatRateEff(card) {
  const r = (card.rewards || []).find((x) => x.category === "everything_else");
  if (!r) return 0;
  return effectiveCashbackRate(r.value, r.unit, card.card_name);
}

// Annualized spend cap on a reward (Infinity when uncapped).
function capAnnual(reward) {
  if (!reward.spend_cap || !reward.cap_period) return Infinity;
  const mult =
    reward.cap_period === "monthly"
      ? 12
      : reward.cap_period === "quarterly"
      ? 4
      : 1; // annual / anything else
  return reward.spend_cap * mult;
}

// Effective rate earned on spend ABOVE a reward's cap. Cards specify
// rate_after_cap (in the reward's own unit); otherwise the category reverts to
// the card's flat everything-else rate.
function overCapEff(reward, cardName, baseEff) {
  if (reward.rate_after_cap === undefined || reward.rate_after_cap === null) {
    return baseEff;
  }
  return effectiveCashbackRate(reward.rate_after_cap, reward.unit, cardName);
}

// Per-bucket effective earning for a single card, given the user's spend.
// Returns { rate, capAnnual, overEff } per bucket. Flexible (single-category)
// bonuses are assigned to the user's highest-spend eligible bucket so a
// Custom-Cash-style card earns its 5% on ONE category, not all of them.
function cardRateMap(card, spend) {
  const baseEff = flatRateEff(card);
  const map = {};
  for (const bucket of SPEND_BUCKETS) {
    map[bucket] = { rate: baseEff, capAnnual: Infinity, overEff: baseEff };
  }

  const flexible = []; // { bucket, reward, eff }
  for (const bucket of SPEND_BUCKETS) {
    if (bucket === "everything_else") continue;
    const m = findCategoryMatch(card, SPEND_CATEGORY_MAP[bucket], null, true, null);
    if (!m || m.mode === "rotating_eligible") continue;
    const eff = effectiveCashbackRate(m.reward.value, m.reward.unit, card.card_name);
    if (eff <= baseEff) continue;
    if (FLEXIBLE_MODES.has(m.mode)) {
      flexible.push({ bucket, reward: m.reward, eff });
    } else if (eff > map[bucket].rate) {
      // Always-on (direct) bonus.
      map[bucket] = {
        rate: eff,
        capAnnual: capAnnual(m.reward),
        overEff: overCapEff(m.reward, card.card_name, baseEff),
      };
    }
  }

  // Assign each flexible reward to the single eligible bucket where the user
  // spends the most (where the bonus is worth the most). One reward can be
  // returned for several buckets, so group by reward identity first.
  const groups = new Map();
  for (const f of flexible) {
    if (!groups.has(f.reward)) groups.set(f.reward, []);
    groups.get(f.reward).push(f);
  }
  for (const list of groups.values()) {
    let chosen = null;
    let chosenSpend = -1;
    for (const f of list) {
      const s = spend[f.bucket] || 0;
      if (s > chosenSpend) {
        chosenSpend = s;
        chosen = f;
      }
    }
    if (chosen && chosen.eff > map[chosen.bucket].rate) {
      map[chosen.bucket] = {
        rate: chosen.eff,
        capAnnual: capAnnual(chosen.reward),
        overEff: overCapEff(chosen.reward, card.card_name, baseEff),
      };
    }
  }

  return map;
}

// Best effective rate per bucket across a set of owned cards, using the user's
// spend to resolve each card's flexible bonus. An empty wallet yields all
// zeros, so a first-time applicant naturally sees full (absolute) value.
// Caps are ignored here (the baseline is an upper bound of what the wallet
// already earns — a deliberately conservative direction for recommendations).
function walletBaseline(ownedCards, spend) {
  const baseline = {};
  for (const bucket of SPEND_BUCKETS) baseline[bucket] = 0;
  for (const card of ownedCards) {
    const map = cardRateMap(card, spend);
    for (const bucket of SPEND_BUCKETS) {
      if (map[bucket].rate > baseline[bucket]) baseline[bucket] = map[bucket].rate;
    }
  }
  return baseline;
}

// Marginal annual rewards ($) a candidate adds on top of the current wallet,
// plus the per-bucket breakdown of where it actually wins. Honors per-reward
// spend caps: the bonus rate earns only up to the cap, the remainder at the
// card's after-cap rate.
function marginalRewards(card, spend, baseline) {
  const map = cardRateMap(card, spend);
  let rewardsValue = 0;
  const winningCategories = [];
  for (const bucket of SPEND_BUCKETS) {
    const annualSpend = spend[bucket] || 0;
    if (annualSpend <= 0) continue;
    const prior = baseline[bucket] || 0;
    const { rate, capAnnual: cap, overEff } = map[bucket];
    const capped = Math.min(annualSpend, cap);
    const over = annualSpend - capped;
    const gain =
      (capped * Math.max(0, rate - prior)) / 100 +
      (over * Math.max(0, overEff - prior)) / 100;
    if (gain > 0.005) {
      winningCategories.push({
        category: bucket,
        rate,
        priorRate: prior,
        annualValue: gain,
      });
      rewardsValue += gain;
    }
  }
  winningCategories.sort((a, b) => b.annualValue - a.annualValue);
  return { rewardsValue, winningCategories };
}

module.exports = {
  SPEND_CATEGORY_MAP,
  SPEND_BUCKETS,
  flatRateEff,
  cardRateMap,
  walletBaseline,
  marginalRewards,
};
