// TypeScript surface for the "best card for me" ranker.
//
// The marginal-rewards math lives in apps/api/src/lib/ranker/nextCardRanking.js
// (shared with the rest of the ranker via the `@ranker/*` alias). This file
// layers on the parts that belong to the frontend — credit amortization
// (reusing amortizedAnnualValue) and the cash-vs-points soft preference — and
// produces the final, typed ranking the /best-card-for-me page renders.
//
// Ranking philosophy (locked in design): ONGOING value, computed MARGINALLY
// over the user's existing wallet. A card that doesn't beat what they already
// hold scores ~0 and drops out. The signup bonus is shown but never ranked on.

import type { Card, CardBenefit } from '@/lib/api';
import { amortizedAnnualValue } from '@/lib/cardDisplayUtils';
import * as engine from '@ranker/nextCardRanking';

export type RewardTypePref = 'cashback' | 'points' | null;

export type NextCardSpend = Record<string, number>;

export interface NextCardInput {
  /** Annual dollar spend per bucket (see SPEND_BUCKETS). */
  spend: NextCardSpend;
  /** Slugs of cards the user already holds. */
  walletSlugs: string[];
  prefs: {
    rewardType: RewardTypePref;
    /** Airline/hotel allegiances — collected for display + blurb; value math
     *  already honors them through point valuations, so they do not re-rank. */
    allegiances?: string[];
  };
  cards: Card[];
  /** How many recommendations to return (default 5). */
  limit?: number;
}

export interface WinningCategory {
  category: string;
  /** Effective cents-per-dollar this card earns in the bucket. */
  rate: number;
  /** What the user's current wallet already earned there. */
  priorRate: number;
  /** Marginal annual dollars this card adds in the bucket. */
  annualValue: number;
}

export interface MatchedCredit {
  name: string;
  value: number;
  category: string;
}

export interface NextCardResult {
  card: Card;
  rank: number;
  /** Honest ongoing value: marginal rewards + matched credits − annual fee. */
  netAnnualValue: number;
  rewardsValue: number;
  creditsValue: number;
  annualFee: number;
  winningCategories: WinningCategory[];
  matchedCredits: MatchedCredit[];
}

// The spend buckets the quiz asks about, and their display labels.
export const SPEND_BUCKETS: string[] = engine.SPEND_BUCKETS as string[];

export const SPEND_BUCKET_LABELS: Record<string, string> = {
  dining: 'Dining & restaurants',
  groceries: 'Groceries',
  gas: 'Gas',
  travel: 'Travel (flights, hotels)',
  transit: 'Transit & rideshare',
  online_shopping: 'Online shopping',
  streaming: 'Streaming',
  everything_else: 'Everything else',
};

// A benefit credit counts toward ongoing value ONLY when it maps to a spend
// bucket the user actually spends in (locked in design — avoids inflating
// annual-fee cards with credits the user wouldn't use). Lifestyle credits with
// no spend bucket (lounge, Global Entry, fitness, "other") are intentionally
// omitted. The keys are CardBenefit['category'] values.
const BENEFIT_CATEGORY_TO_BUCKETS: Record<string, string[]> = {
  dining: ['dining'],
  dining_travel: ['dining', 'travel'],
  travel: ['travel'],
  hotel: ['travel'],
  gas: ['gas'],
  grocery: ['groceries'],
  rideshare: ['transit', 'travel'],
  car_rental: ['travel'],
  streaming: ['streaming'],
  shopping: ['online_shopping'],
  // entertainment, fitness, lounge, security, other → not a spend category
};

function matchedCreditsFor(
  benefits: CardBenefit[] | undefined,
  spend: NextCardSpend,
): { total: number; matched: MatchedCredit[] } {
  const matched: MatchedCredit[] = [];
  let total = 0;
  for (const b of benefits || []) {
    const buckets = BENEFIT_CATEGORY_TO_BUCKETS[b.category];
    if (!buckets) continue;
    if (!buckets.some((bk) => (spend[bk] || 0) > 0)) continue;
    const value = amortizedAnnualValue(b); // 0 for points/ongoing/per-use benefits
    if (value > 0) {
      total += value;
      matched.push({ name: b.name, value, category: b.category });
    }
  }
  return { total, matched };
}

// Short, prose-friendly category names for the "why" blurb (mid-sentence).
const PROSE_CATEGORY: Record<string, string> = {
  dining: 'dining',
  groceries: 'groceries',
  gas: 'gas',
  travel: 'travel',
  transit: 'transit',
  online_shopping: 'online shopping',
  streaming: 'streaming',
  everything_else: 'everyday spending',
};

// A deterministic one-line rationale for why a card ranks where it does.
// Templated (no LLM dependency) so results never block on an external call.
// When ANTHROPIC_API_KEY is provisioned, this can be swapped for an LLM-written
// line; the structured inputs (winning categories, credits, fee) are the prompt.
export function nextCardBlurb(rec: NextCardResult): string {
  const bonusCats = rec.winningCategories
    .filter((w) => w.category !== 'everything_else')
    .slice(0, 2)
    .map((w) => PROSE_CATEGORY[w.category] || w.category);
  const liftsEveryday = rec.winningCategories.some((w) => w.category === 'everything_else');

  let lead: string;
  if (bonusCats.length === 2) {
    lead = `Out-earns your current cards on ${bonusCats[0]} and ${bonusCats[1]}`;
  } else if (bonusCats.length === 1) {
    lead = `Out-earns your current cards on ${bonusCats[0]}`;
  } else if (liftsEveryday) {
    lead = 'Lifts your flat rate on everyday spending';
  } else {
    lead = 'Adds ongoing value across your spending';
  }

  let tail: string;
  if (rec.annualFee > 0) {
    tail =
      rec.creditsValue >= rec.annualFee
        ? `, and the credits you'd use more than cover the $${rec.annualFee} fee`
        : `, even after the $${rec.annualFee} annual fee`;
  } else {
    tail = ', with no annual fee';
  }

  return `${lead}${tail}.`;
}

export function rankNextCards(input: NextCardInput): NextCardResult[] {
  const { spend, walletSlugs, prefs, cards } = input;
  const limit = input.limit ?? 5;

  const walletSet = new Set(walletSlugs);
  const owned = cards.filter((c) => walletSet.has(c.slug));
  const baseline = engine.walletBaseline(owned, spend);

  const scored = cards
    .filter((c) => !walletSet.has(c.slug) && c.accepting_applications !== false)
    .map((card) => {
      const { rewardsValue, winningCategories } = engine.marginalRewards(
        card,
        spend,
        baseline,
      ) as { rewardsValue: number; winningCategories: WinningCategory[] };
      const { total: creditsValue, matched } = matchedCreditsFor(card.benefits, spend);
      const annualFee = card.annual_fee || 0;
      const netAnnualValue = rewardsValue + creditsValue - annualFee;

      // Cash-vs-points is a soft preference, not a filter: a points card with a
      // big enough value edge still beats a cash card the user nominally prefers.
      let score = netAnnualValue;
      const rt = card.reward_type;
      if (prefs.rewardType === 'cashback' && rt && rt !== 'cashback') score *= 0.9;
      if (prefs.rewardType === 'points' && rt === 'cashback') score *= 0.95;

      return {
        card,
        score,
        netAnnualValue,
        rewardsValue,
        creditsValue,
        annualFee,
        winningCategories,
        matchedCredits: matched,
      };
    })
    // Only recommend cards that genuinely add positive ongoing value.
    .filter((s) => s.netAnnualValue > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s, i) => ({
    card: s.card,
    rank: i + 1,
    netAnnualValue: s.netAnnualValue,
    rewardsValue: s.rewardsValue,
    creditsValue: s.creditsValue,
    annualFee: s.annualFee,
    winningCategories: s.winningCategories,
    matchedCredits: s.matchedCredits,
  }));
}
