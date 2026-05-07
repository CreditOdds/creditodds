import type { Card, Reward } from '@/lib/api';
import type { Store } from '@/lib/stores';
import { getValuation } from '@/lib/valuations';

export type MatchMode =
  | 'direct'
  | 'rotating_current'
  | 'rotating_eligible'
  | 'user_choice'
  | 'top_spend';

export type Channel = 'both' | 'online' | 'in_store';

export interface RankedPick {
  card: Card;
  rate: number;
  unit: 'percent' | 'points_per_dollar';
  effectiveRate: number;
  reason: string;
  badge?: string;
  source: 'co_brand' | 'also_earns' | 'category' | 'flat_rate';
  matchMode?: MatchMode;
  channel?: Channel;
  note?: string;
}

interface CardMatch {
  reward: Reward;
  matchedCategory: string;
  mode: MatchMode;
}

export interface RankCardsOptions {
  /** Effective-rate floor for category-bonus picks. Default 1.5. */
  flatRateFloor?: number;
  /** Effective-rate floor for the flat-rate fallback fill-in. Default 2. */
  flatRateFillFloor?: number;
  /** Cap on the number of returned picks. Default 10. */
  maxPicks?: number;
}

const CATEGORY_CHANNEL: Record<string, Channel> = {
  online_shopping: 'online',
  amazon: 'online',
  rakuten: 'online',
  rakuten_dining: 'online',
  travel_portal: 'online',
  hotels_portal: 'online',
  flights_portal: 'online',
  car_rentals_portal: 'online',
  hotels_car_portal: 'online',
};

const CATEGORY_LABELS: Record<string, string> = {
  department_stores: 'department stores',
  online_shopping: 'online shopping',
  groceries: 'groceries',
  dining: 'dining',
  gas: 'gas',
  travel: 'travel',
  everything_else: 'everything else',
  home_improvement: 'home improvement',
  drugstores: 'drugstores',
  wholesale_clubs: 'wholesale clubs',
};

export function labelForCategory(id: string): string {
  return CATEGORY_LABELS[id] || id.replace(/_/g, ' ');
}

export function channelForCategory(categoryId: string): Channel {
  return CATEGORY_CHANNEL[categoryId] || 'both';
}

export function effectiveCashbackRate(
  rate: number,
  unit: 'percent' | 'points_per_dollar',
  cardName: string,
): number {
  if (unit === 'percent') return rate;
  const cpp = getValuation(cardName);
  return rate * cpp;
}

export function formatRate(value: number, unit: 'percent' | 'points_per_dollar'): string {
  if (unit === 'percent') return `${value}%`;
  return `${value}x points`;
}

function formatCap(reward: Reward): string {
  if (!reward.spend_cap || !reward.cap_period) return '';
  const period =
    reward.cap_period === 'quarterly'
      ? 'quarter'
      : reward.cap_period === 'monthly'
      ? 'month'
      : reward.cap_period === 'annual'
      ? 'year'
      : reward.cap_period;
  const after = reward.rate_after_cap !== undefined ? `, then ${reward.rate_after_cap}%` : '';
  return ` (up to $${reward.spend_cap.toLocaleString()}/${period}${after})`;
}

function inferRewardMode(
  r: Reward,
): 'quarterly_rotating' | 'user_choice' | 'auto_top_spend' | 'direct' {
  if (r.mode === 'quarterly_rotating' || r.current_categories || r.current_period) {
    return 'quarterly_rotating';
  }
  if (r.mode === 'auto_top_spend' || r.category === 'top_category') {
    return 'auto_top_spend';
  }
  if (r.mode === 'user_choice' || typeof r.choices === 'number') {
    return 'user_choice';
  }
  return 'direct';
}

function compareMatches(a: CardMatch, b: CardMatch, modeRank: Record<MatchMode, number>): number {
  if (a.reward.value !== b.reward.value) return a.reward.value - b.reward.value;
  return modeRank[a.mode] - modeRank[b.mode];
}

export function findCategoryMatch(
  card: Card,
  categories: string[],
  storeSlug: string | null,
  includeMerchantSpecific = false,
): CardMatch | null {
  if (!card.rewards) return null;
  const modeRank: Record<MatchMode, number> = {
    direct: 5,
    rotating_current: 4,
    user_choice: 3,
    top_spend: 2,
    rotating_eligible: 1,
  };
  let best: CardMatch | null = null;

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
        const candidate: CardMatch = { reward: r, matchedCategory: r.category, mode: 'direct' };
        if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      }
      continue;
    }

    const inferred = inferRewardMode(r);

    if (
      inferred === 'direct' &&
      categories.includes(r.category) &&
      (!r.merchant_specific || includeMerchantSpecific)
    ) {
      const candidate: CardMatch = { reward: r, matchedCategory: r.category, mode: 'direct' };
      if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      continue;
    }

    if (inferred === 'quarterly_rotating') {
      const current = (r.current_categories || []).map((c) =>
        typeof c === 'string' ? c : c.category,
      );
      const eligible = r.eligible_categories || [];
      const inCurrent = categories.find((c) => current.includes(c));
      const inEligible = !inCurrent ? categories.find((c) => eligible.includes(c)) : undefined;
      if (inCurrent) {
        const candidate: CardMatch = {
          reward: r,
          matchedCategory: inCurrent,
          mode: 'rotating_current',
        };
        if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      } else if (inEligible) {
        const candidate: CardMatch = {
          reward: r,
          matchedCategory: inEligible,
          mode: 'rotating_eligible',
        };
        if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      }
      continue;
    }

    if (inferred === 'auto_top_spend') {
      const eligible = r.eligible_categories || [];
      const matched = categories.find((c) => eligible.includes(c));
      if (matched) {
        const candidate: CardMatch = { reward: r, matchedCategory: matched, mode: 'top_spend' };
        if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      }
      continue;
    }

    if (inferred === 'user_choice') {
      const eligible = r.eligible_categories || [];
      const matched = categories.find((c) => eligible.includes(c));
      if (matched) {
        const candidate: CardMatch = { reward: r, matchedCategory: matched, mode: 'user_choice' };
        if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      }
    }
  }

  return best;
}

function flatRateReward(card: Card): Reward | null {
  if (!card.rewards) return null;
  return card.rewards.find((r) => r.category === 'everything_else') || null;
}

function reasonAndBadgeForMatch(match: CardMatch): { reason: string; badge: string } {
  const rateStr = formatRate(match.reward.value, match.reward.unit as 'percent' | 'points_per_dollar');
  const catLabel = labelForCategory(match.matchedCategory);
  const cap = formatCap(match.reward);
  switch (match.mode) {
    case 'direct':
      return { reason: `${rateStr} on ${catLabel}${cap}`, badge: '' };
    case 'rotating_current': {
      const period = match.reward.current_period ? ` (${match.reward.current_period})` : '';
      return {
        reason: `${rateStr} on ${catLabel} this quarter${period}${cap}. Activation required each quarter.`,
        badge: 'this quarter',
      };
    }
    case 'user_choice':
      return {
        reason: `${rateStr} on ${catLabel} if you select it as a bonus category${cap}`,
        badge: 'if you select it',
      };
    case 'top_spend':
      return {
        reason: `${rateStr} on ${catLabel} if it's your top eligible spend category that cycle${cap}`,
        badge: 'if it’s your top category',
      };
    case 'rotating_eligible':
      return {
        reason: `Up to ${rateStr} on ${catLabel} when it rotates in. Not in this quarter's lineup — check before a trip.`,
        badge: 'situational',
      };
  }
}

export function rankCards(
  store: Store,
  cards: Card[],
  options: RankCardsOptions = {},
): RankedPick[] {
  const flatRateFloor = options.flatRateFloor ?? 1.5;
  const flatRateFillFloor = options.flatRateFillFloor ?? 2;
  const maxPicks = options.maxPicks ?? 10;

  const active = cards.filter((c) => c.accepting_applications !== false);
  const cardsBySlug = new Map(active.map((c) => [c.slug, c]));
  const used = new Set<string>();
  const picks: RankedPick[] = [];

  // 1. Co-brand
  for (const slug of store.co_brand_cards || []) {
    const card = cardsBySlug.get(slug);
    if (!card || used.has(slug)) continue;
    const match = findCategoryMatch(card, store.categories, store.slug, true);
    const r = match?.reward || flatRateReward(card);
    const rate = r?.value ?? 0;
    const unit = (r?.unit as 'percent' | 'points_per_dollar') ?? 'percent';
    picks.push({
      card,
      rate,
      unit,
      effectiveRate: effectiveCashbackRate(rate, unit, card.card_name),
      reason: `Co-branded ${store.name} card`,
      source: 'co_brand',
      channel: 'both',
      note: r?.note,
    });
    used.add(slug);
  }

  // 2. Build the rate-ranked group: also_earns + category bonuses competing on effective rate.
  type RankedCandidate =
    | {
        kind: 'also_earns';
        card: Card;
        rate: number;
        unit: 'percent' | 'points_per_dollar';
        note?: string;
        effective: number;
      }
    | { kind: 'category'; card: Card; match: CardMatch; effective: number };
  const candidates: RankedCandidate[] = [];

  for (const entry of store.also_earns || []) {
    const card = cardsBySlug.get(entry.card);
    if (!card || used.has(entry.card)) continue;
    const eff = effectiveCashbackRate(entry.rate, entry.unit, card.card_name);
    candidates.push({
      kind: 'also_earns',
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
    const m = findCategoryMatch(card, store.categories, store.slug);
    if (!m) continue;
    const eff = effectiveCashbackRate(
      m.reward.value,
      m.reward.unit as 'percent' | 'points_per_dollar',
      card.card_name,
    );
    if (eff <= flatRateFloor) continue;
    const effective = m.mode === 'rotating_eligible' ? eff - 100 : eff;
    candidates.push({ kind: 'category', card, match: m, effective });
  }

  candidates.sort((a, b) => b.effective - a.effective);

  for (const c of candidates) {
    if (c.kind === 'also_earns') {
      picks.push({
        card: c.card,
        rate: c.rate,
        unit: c.unit,
        effectiveRate: effectiveCashbackRate(c.rate, c.unit, c.card.card_name),
        reason: `Earns ${formatRate(c.rate, c.unit)} at ${store.name}`,
        source: 'also_earns',
        channel: 'both',
        note: c.note,
      });
    } else {
      const { reason, badge } = reasonAndBadgeForMatch(c.match);
      picks.push({
        card: c.card,
        rate: c.match.reward.value,
        unit: c.match.reward.unit as 'percent' | 'points_per_dollar',
        effectiveRate: effectiveCashbackRate(
          c.match.reward.value,
          c.match.reward.unit as 'percent' | 'points_per_dollar',
          c.card.card_name,
        ),
        reason,
        badge: badge || undefined,
        channel: channelForCategory(c.match.matchedCategory),
        source: 'category',
        matchMode: c.match.mode,
        note: c.match.reward.note,
      });
    }
    used.add(c.card.slug);
  }

  // 3. Flat-rate fallback fill.
  if (picks.length < maxPicks) {
    const flatPicks: { card: Card; reward: Reward }[] = [];
    for (const card of active) {
      if (used.has(card.slug)) continue;
      const reward = flatRateReward(card);
      if (reward && reward.unit === 'percent' && reward.value >= flatRateFillFloor) {
        flatPicks.push({ card, reward });
      }
    }
    flatPicks.sort((a, b) => b.reward.value - a.reward.value);
    for (const { card, reward } of flatPicks.slice(0, maxPicks - picks.length)) {
      picks.push({
        card,
        rate: reward.value,
        unit: reward.unit as 'percent',
        effectiveRate: reward.value,
        reason: `${formatRate(reward.value, 'percent')} flat-rate cashback`,
        source: 'flat_rate',
        note: reward.note,
      });
      used.add(card.slug);
    }
  }

  return picks.slice(0, maxPicks);
}
