// Core card-ranking engine. Plain CommonJS so it can be required by Lambda
// handlers AND imported by the Next.js frontend via tsconfig path alias.
//
// MatchMode (string union, runtime values):
//   "direct" | "rotating_current" | "rotating_eligible"
//   | "user_choice" | "user_selected" | "top_spend"

const { getValuation } = require("./valuations");

const CATEGORY_CHANNEL = {
  online_shopping: "online",
  amazon: "online",
  rakuten: "online",
  rakuten_dining: "online",
  travel_portal: "online",
  hotels_portal: "online",
  flights_portal: "online",
  car_rentals_portal: "online",
  hotels_car_portal: "online",
};

const CATEGORY_LABELS = {
  department_stores: "department stores",
  online_shopping: "online shopping",
  groceries: "groceries",
  dining: "dining",
  gas: "gas",
  travel: "travel",
  everything_else: "everything else",
  home_improvement: "home improvement",
  drugstores: "drugstores",
  wholesale_clubs: "wholesale clubs",
};

function labelForCategory(id) {
  return CATEGORY_LABELS[id] || id.replace(/_/g, " ");
}

function channelForCategory(categoryId) {
  return CATEGORY_CHANNEL[categoryId] || "both";
}

function effectiveCashbackRate(rate, unit, cardName) {
  if (unit === "percent") return rate;
  const cpp = getValuation(cardName);
  return rate * cpp;
}

function formatRate(value, unit) {
  if (unit === "percent") return `${value}%`;
  return `${value}x points`;
}

function formatCap(reward) {
  if (!reward.spend_cap || !reward.cap_period) return "";
  const period =
    reward.cap_period === "quarterly"
      ? "quarter"
      : reward.cap_period === "monthly"
      ? "month"
      : reward.cap_period === "annual"
      ? "year"
      : reward.cap_period;
  const after = reward.rate_after_cap !== undefined ? `, then ${reward.rate_after_cap}%` : "";
  return ` (up to $${reward.spend_cap.toLocaleString()}/${period}${after})`;
}

function inferRewardMode(r) {
  if (r.mode === "quarterly_rotating" || r.current_categories || r.current_period) {
    return "quarterly_rotating";
  }
  if (r.mode === "auto_top_spend" || r.category === "top_category") {
    return "auto_top_spend";
  }
  if (r.mode === "user_choice" || typeof r.choices === "number") {
    return "user_choice";
  }
  return "direct";
}

function compareMatches(a, b, modeRank) {
  if (a.reward.value !== b.reward.value) return a.reward.value - b.reward.value;
  return modeRank[a.mode] - modeRank[b.mode];
}

function findCategoryMatch(card, categories, storeSlug, includeMerchantSpecific, userSelections) {
  if (!card.rewards) return null;
  const modeRank = {
    direct: 5,
    user_selected: 5,
    rotating_current: 4,
    user_choice: 3,
    top_spend: 2,
    rotating_eligible: 1,
  };
  let best = null;

  for (const r of card.rewards) {
    // merchant_gate: explicit list of store slugs this reward applies to.
    // If set, the reward earns ONLY at those stores and is skipped elsewhere
    // — regardless of category match. This is the structured fix for
    // co-brand cards whose airline/hotel rate is brand-gated (e.g. United
    // Explorer 3x airlines is gated to ["united-airlines"], so it should
    // not surface at JetBlue or Delta).
    if (r.merchant_gate && r.merchant_gate.length > 0) {
      if (!storeSlug || !r.merchant_gate.includes(storeSlug)) continue;
      if (categories.includes(r.category)) {
        const candidate = { reward: r, matchedCategory: r.category, mode: "direct" };
        if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      }
      continue;
    }

    const inferred = inferRewardMode(r);

    if (
      inferred === "direct" &&
      categories.includes(r.category) &&
      (!r.merchant_specific || includeMerchantSpecific)
    ) {
      const candidate = { reward: r, matchedCategory: r.category, mode: "direct" };
      if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      continue;
    }

    if (inferred === "quarterly_rotating") {
      const current = (r.current_categories || []).map((c) =>
        typeof c === "string" ? c : c.category,
      );
      const eligible = r.eligible_categories || [];
      const inCurrent = categories.find((c) => current.includes(c));
      const inEligible = !inCurrent ? categories.find((c) => eligible.includes(c)) : undefined;
      if (inCurrent) {
        const candidate = {
          reward: r,
          matchedCategory: inCurrent,
          mode: "rotating_current",
        };
        if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      } else if (inEligible) {
        const candidate = {
          reward: r,
          matchedCategory: inEligible,
          mode: "rotating_eligible",
        };
        if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      }
      continue;
    }

    if (inferred === "auto_top_spend" || inferred === "user_choice") {
      const eligible = r.eligible_categories || [];

      const blockSelections = userSelections?.filter(
        (s) => s.reward_category === r.category && s.reward_rate === r.value,
      );

      if (blockSelections && blockSelections.length > 0) {
        const userPicks = new Set(blockSelections.map((s) => s.selected_category));
        const matched = categories.find((c) => userPicks.has(c) && eligible.includes(c));
        if (matched) {
          const candidate = { reward: r, matchedCategory: matched, mode: "user_selected" };
          if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
        }
        continue;
      }

      const matched = categories.find((c) => eligible.includes(c));
      if (matched) {
        const mode = inferred === "auto_top_spend" ? "top_spend" : "user_choice";
        const candidate = { reward: r, matchedCategory: matched, mode };
        if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      }
    }
  }

  return best;
}

function flatRateReward(card) {
  if (!card.rewards) return null;
  return card.rewards.find((r) => r.category === "everything_else") || null;
}

function reasonAndBadgeForMatch(match) {
  const rateStr = formatRate(match.reward.value, match.reward.unit);
  const catLabel = labelForCategory(match.matchedCategory);
  const cap = formatCap(match.reward);
  switch (match.mode) {
    case "direct":
      return { reason: `${rateStr} on ${catLabel}${cap}`, badge: "" };
    case "rotating_current": {
      const period = match.reward.current_period ? ` (${match.reward.current_period})` : "";
      return {
        reason: `${rateStr} on ${catLabel} this quarter${period}${cap}. Activation required each quarter.`,
        badge: "this quarter",
      };
    }
    case "user_choice":
      return {
        reason: `${rateStr} on ${catLabel} if you select it as a bonus category${cap}`,
        badge: "if you select it",
      };
    case "user_selected":
      return {
        reason: `${rateStr} on ${catLabel} (your selected category)${cap}`,
        badge: "selected",
      };
    case "top_spend":
      return {
        reason: `${rateStr} on ${catLabel} if it's your top eligible spend category that cycle${cap}`,
        badge: "if it’s your top category",
      };
    case "rotating_eligible":
      return {
        reason: `Up to ${rateStr} on ${catLabel} when it rotates in. Not in this quarter's lineup — check before a trip.`,
        badge: "situational",
      };
    default:
      return { reason: "", badge: "" };
  }
}

function rankCards(store, cards, options) {
  const opts = options || {};
  const walletSet = opts.walletCardSlugs ? new Set(opts.walletCardSlugs) : null;
  const isWalletMode = walletSet !== null;
  const flatRateFloor = opts.flatRateFloor ?? (isWalletMode ? 0 : 1.5);
  const flatRateFillFloor = opts.flatRateFillFloor ?? (isWalletMode ? 0 : 2);
  const maxPicks = opts.maxPicks ?? 10;

  const active = cards.filter((c) =>
    walletSet ? walletSet.has(c.slug) : c.accepting_applications !== false,
  );
  const cardsBySlug = new Map(active.map((c) => [c.slug, c]));
  const used = new Set();
  const picks = [];

  // 1. Co-brand. Collected first, then sorted by effective rate so the
  // strongest co-brand leads — co_brand_cards YAML order is typically
  // ascending by annual fee (e.g. United Gateway → Club Infinite), and
  // rendering that order verbatim put the weakest card at #1.
  const coBrandPicks = [];
  for (const slug of store.co_brand_cards || []) {
    const card = cardsBySlug.get(slug);
    if (!card || used.has(slug)) continue;
    const match = findCategoryMatch(
      card,
      store.categories,
      store.slug,
      true,
      opts.userSelections?.get(card.slug),
    );
    const r = match?.reward || flatRateReward(card);
    const rate = r?.value ?? 0;
    const unit = r?.unit ?? "percent";
    coBrandPicks.push({
      card,
      rate,
      unit,
      effectiveRate: effectiveCashbackRate(rate, unit, card.card_name),
      reason: `Co-branded ${store.name} card`,
      source: "co_brand",
      channel: "both",
      note: r?.note,
    });
    used.add(slug);
  }
  coBrandPicks.sort((a, b) => b.effectiveRate - a.effectiveRate);
  picks.push(...coBrandPicks);

  // 2. Build the rate-ranked group: also_earns, category bonuses, and
  // flat-rate cards all competing on effective rate. Flat-rate cards used to
  // be appended after every category pick regardless of rate, which let a
  // 2%-effective category bonus outrank a 3% flat-rate card — the ordering
  // now honors the page's promise of "highest rate at this store" across
  // sources. rotating_eligible candidates keep their -100 sort penalty, so
  // situational "when it rotates in" picks still land below flat-rate cards.
  const candidates = [];

  for (const entry of store.also_earns || []) {
    const card = cardsBySlug.get(entry.card);
    if (!card || used.has(entry.card)) continue;
    const eff = effectiveCashbackRate(entry.rate, entry.unit, card.card_name);
    candidates.push({
      kind: "also_earns",
      card,
      rate: entry.rate,
      unit: entry.unit,
      note: entry.note,
      effective: eff,
    });
  }

  for (const card of active) {
    if (used.has(card.slug)) continue;
    if (candidates.some((c) => c.card.slug === card.slug)) continue;
    const m = findCategoryMatch(
      card,
      store.categories,
      store.slug,
      false,
      opts.userSelections?.get(card.slug),
    );
    const eff = m
      ? effectiveCashbackRate(m.reward.value, m.reward.unit, card.card_name)
      : 0;
    if (m && eff > flatRateFloor) {
      const effective = m.mode === "rotating_eligible" ? eff - 100 : eff;
      candidates.push({ kind: "category", card, match: m, effective });
      continue;
    }
    // No qualifying category match — the card can still compete on its
    // flat everything_else rate.
    const reward = flatRateReward(card);
    if (reward && reward.unit === "percent" && reward.value >= flatRateFillFloor) {
      candidates.push({ kind: "flat", card, reward, effective: reward.value });
    }
  }

  candidates.sort((a, b) => b.effective - a.effective);

  for (const c of candidates) {
    if (c.kind === "also_earns") {
      picks.push({
        card: c.card,
        rate: c.rate,
        unit: c.unit,
        effectiveRate: effectiveCashbackRate(c.rate, c.unit, c.card.card_name),
        reason: `Earns ${formatRate(c.rate, c.unit)} at ${store.name}`,
        source: "also_earns",
        channel: "both",
        note: c.note,
      });
    } else if (c.kind === "flat") {
      picks.push({
        card: c.card,
        rate: c.reward.value,
        unit: c.reward.unit,
        effectiveRate: c.reward.value,
        reason: `${formatRate(c.reward.value, "percent")} flat-rate cashback`,
        source: "flat_rate",
        note: c.reward.note,
      });
    } else {
      const { reason, badge } = reasonAndBadgeForMatch(c.match);
      picks.push({
        card: c.card,
        rate: c.match.reward.value,
        unit: c.match.reward.unit,
        effectiveRate: effectiveCashbackRate(c.match.reward.value, c.match.reward.unit, c.card.card_name),
        reason,
        badge: badge || undefined,
        channel: channelForCategory(c.match.matchedCategory),
        source: "category",
        matchMode: c.match.mode,
        note: c.match.reward.note,
      });
    }
    used.add(c.card.slug);
  }

  return picks.slice(0, maxPicks);
}

module.exports = {
  rankCards,
  findCategoryMatch,
  effectiveCashbackRate,
  formatRate,
  labelForCategory,
  channelForCategory,
};
