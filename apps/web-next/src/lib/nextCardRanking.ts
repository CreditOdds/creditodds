// TypeScript surface for the "best card for me" ranker.
//
// The earnings math lives in apps/api/src/lib/ranker/nextCardRanking.js (shared
// with the rest of the ranker via the `@ranker/*` alias). It models the wallet
// as a set of cards (duplicates allowed), allocates flexible/capped bonuses,
// and reports per-category earnings. This file layers on the frontend parts —
// the cash-vs-points soft preference and the "why" blurb — and produces the
// final, typed ranking + wallet analysis the /best-card-for-me page renders.
//
// Ranking philosophy (locked in design): ONGOING value from CATEGORY EARNING
// (cash back / points), computed MARGINALLY over the user's existing wallet,
// minus the annual fee. Card credits/benefits are intentionally excluded so
// heavy-credit cards (e.g. Amex Platinum) don't skew the ranking. A card that
// doesn't beat what they already hold scores ~0 and drops out. The signup
// bonus is shown but never ranked on.

import type { Card } from '@/lib/api';
import * as engine from '@ranker/nextCardRanking';

export type RewardTypePref = 'cashback' | 'points' | null;

export type NextCardSpend = Record<string, number>;

export interface NextCardInput {
  /** Annual dollar spend per bucket (see SPEND_BUCKETS). */
  spend: NextCardSpend;
  /** Slugs of cards the user already holds. May contain duplicates (e.g. two
   *  Citi Custom Cash). */
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

// Per-category comparison of the wallet with vs without a candidate card.
export interface CategoryBreakdown {
  category: string;
  spend: number;
  currentRate: number;
  currentCard: string | null;
  currentCardImage: string | null;
  currentEarned: number;
  newRate: number;
  newEarned: number;
  delta: number;
  helps: boolean;
}

// A spend layer in a category: a rate, the card that earns it (null = base /
// no bonus), and how much annual spend falls in this layer.
export interface WalletTier {
  rate: number;
  card: string | null;
  cardImage: string | null;
  spend: number;
  // How many copies of this card stack into the tier (two Custom Cash → 2, so
  // the UI fans out two card images and the combined $1,000/mo cap).
  count: number;
}

// One row of the "your wallet today" table. `best` is the top rate (up to its
// cap); `next` is where the remaining spend falls once that cap is hit (e.g. a
// 2nd Custom Cash, the next card, or base) — null when nothing spills over.
export interface WalletAnalysisRow {
  category: string;
  spend: number;
  earned: number;
  best: WalletTier;
  next: WalletTier | null;
}

export interface NextCardResult {
  card: Card;
  rank: number;
  /** Ongoing value from category earning only: marginal rewards − annual fee.
   *  Card credits/benefits are intentionally excluded so heavy-credit cards
   *  (e.g. Amex Platinum) don't skew the ranking — this is about cash back and
   *  points earned on the user's actual spending. */
  netAnnualValue: number;
  rewardsValue: number;
  annualFee: number;
  winningCategories: WinningCategory[];
  categories: CategoryBreakdown[];
}

export interface NextCardRanking {
  recommendations: NextCardResult[];
  walletAnalysis: WalletAnalysisRow[];
}

// The spend buckets the quiz asks about, and their display labels.
export const SPEND_BUCKETS: string[] = engine.SPEND_BUCKETS as string[];

// True for portal-dependent categories (travel_portal, …). Re-exported from the
// ranker so the route can filter them without importing the React-heavy
// cardDisplayUtils.
export const isPortalCategory = engine.isPortalCategory as (category: string) => boolean;

export const SPEND_BUCKET_LABELS: Record<string, string> = {
  dining: 'Dining & restaurants',
  groceries: 'Groceries',
  gas: 'Gas',
  flights: 'Flights',
  hotels: 'Hotels',
  transit: 'Transit & rideshare',
  online_shopping: 'Online shopping',
  streaming: 'Streaming',
  everything_else: 'Everything else',
};

// Short, prose-friendly category names for the "why" blurb (mid-sentence).
const PROSE_CATEGORY: Record<string, string> = {
  dining: 'dining',
  groceries: 'groceries',
  gas: 'gas',
  flights: 'flights',
  hotels: 'hotels',
  transit: 'transit',
  online_shopping: 'online shopping',
  streaming: 'streaming',
  everything_else: 'everyday spending',
};

// A deterministic one-line rationale for why a card ranks where it does.
// Templated (no LLM dependency) so results never block on an external call.
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

  const tail = rec.annualFee > 0 ? `, even after the $${rec.annualFee} annual fee` : ', with no annual fee';

  return `${lead}${tail}.`;
}

interface WalletEarnings {
  perBucket: Record<
    string,
    {
      spend: number;
      earned: number;
      topRate: number;
      topCard: string | null;
      segments: { rate: number; amount: number; card: string | null }[];
    }
  >;
  total: number;
  baseEff: number;
}

export function rankNextCards(input: NextCardInput): NextCardRanking {
  const { spend, walletSlugs, prefs, cards } = input;
  const limit = input.limit ?? 5;

  const bySlug = new Map(cards.map((c) => [c.slug, c]));
  // The engine reports which card provides a category's top rate by name; map
  // that back to the card image for the analysis tables.
  const byName = new Map(cards.map((c) => [c.card_name, c]));
  const imageFor = (name: string | null) =>
    name ? byName.get(name)?.card_image_link ?? null : null;
  // Owned cards, WITH multiplicity (two Custom Cash → two entries).
  const owned = walletSlugs
    .map((slug) => bySlug.get(slug))
    .filter((c): c is Card => Boolean(c));
  const walletSet = new Set(walletSlugs);
  const allegiances = prefs.allegiances ?? [];

  const base = engine.walletEarnings(owned, spend, allegiances) as WalletEarnings;

  const scored = cards
    // Never recommend a card the user already holds, or one that's no longer
    // accepting applications / has been discontinued. (Owned non-accepting
    // cards still count toward the wallet earnings above — we just don't
    // recommend them.)
    .filter(
      (c) =>
        !walletSet.has(c.slug) &&
        c.accepting_applications !== false &&
        c.active !== false,
    )
    .map((card) => {
      const { rewardsValue, winningCategories, categories } = engine.recommendationBreakdown(
        card,
        owned,
        spend,
        base,
        allegiances,
      ) as {
        rewardsValue: number;
        winningCategories: WinningCategory[];
        categories: Omit<CategoryBreakdown, 'currentCardImage'>[];
      };
      // Credits/benefits are intentionally excluded — value is category earning
      // minus the annual fee, so heavy-credit cards don't dominate.
      const annualFee = card.annual_fee || 0;
      const netAnnualValue = rewardsValue - annualFee;

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
        annualFee,
        winningCategories,
        categories,
      };
    })
    // Only recommend cards that genuinely add positive ongoing value.
    .filter((s) => s.netAnnualValue > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const recommendations: NextCardResult[] = scored.map((s, i) => ({
    card: s.card,
    rank: i + 1,
    netAnnualValue: s.netAnnualValue,
    rewardsValue: s.rewardsValue,
    annualFee: s.annualFee,
    winningCategories: s.winningCategories,
    categories: s.categories.map((c) => ({
      ...c,
      currentCardImage: imageFor(c.currentCard),
    })),
  }));

  const walletAnalysis: WalletAnalysisRow[] = SPEND_BUCKETS.filter(
    (b) => (spend[b] || 0) > 0,
  ).map((b) => {
    const pb = base.perBucket[b];
    // Collapse consecutive layers from the SAME card into one tier, counting the
    // copies. Two Custom Cash → one 5% tier covering $1,000/mo with count 2 (the
    // UI fans out two card images); the next DIFFERENT card is the overflow.
    const tiers: { rate: number; card: string | null; spend: number; count: number }[] = [];
    for (const seg of pb.segments) {
      const last = tiers[tiers.length - 1];
      if (last && last.card === seg.card && Math.abs(last.rate - seg.rate) < 0.001) {
        last.spend += seg.amount;
        last.count += 1;
      } else {
        tiers.push({ rate: seg.rate, card: seg.card, spend: seg.amount, count: 1 });
      }
    }
    const toTier = (t: (typeof tiers)[number]): WalletTier => ({
      rate: t.rate,
      card: t.card,
      cardImage: imageFor(t.card),
      spend: t.spend,
      count: t.count,
    });
    const best: WalletTier = tiers[0]
      ? toTier(tiers[0])
      : { rate: pb.topRate, card: pb.topCard, cardImage: imageFor(pb.topCard), spend: pb.spend, count: 1 };
    return {
      category: b,
      spend: pb.spend,
      earned: pb.earned,
      best,
      next: tiers[1] ? toTier(tiers[1]) : null,
    };
  });

  return { recommendations, walletAnalysis };
}
