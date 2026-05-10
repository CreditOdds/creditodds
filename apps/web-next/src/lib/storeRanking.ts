// TypeScript surface for the ranker. The implementation lives in
// apps/api/src/lib/ranker/storeRanking.js (single source of truth, shared
// with the Lambda wallet-picks handlers). This file imports those runtime
// functions via the `@ranker/*` tsconfig alias and re-exports them with
// proper TypeScript types so the public SSR page on /best-card-for/[slug]
// gets the same engine the wallet endpoints use.
//
// The JS module has no JSDoc types — type assertions on the re-exports are
// the spec. If you change a signature, update both this file AND the JS
// twin's runtime behaviour to match.

import type { Card, WalletCardSelection } from '@/lib/api';
import type { Store } from '@/lib/stores';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import * as ranker from '@ranker/storeRanking';

export type MatchMode =
  | 'direct'
  | 'rotating_current'
  | 'rotating_eligible'
  | 'user_choice'
  | 'user_selected'
  | 'top_spend';

export type UserSelectionsByCard = Map<string, WalletCardSelection[]>;

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

export interface RankCardsOptions {
  /** Effective-rate floor for category-bonus picks. Default 1.5 (0 in wallet mode). */
  flatRateFloor?: number;
  /** Effective-rate floor for the flat-rate fallback fill-in. Default 2 (0 in wallet mode). */
  flatRateFillFloor?: number;
  /** Cap on the number of returned picks. Default 10. */
  maxPicks?: number;
  /**
   * Wallet mode: when provided, restrict ranking to these card slugs.
   * Skips the `accepting_applications` filter so closed/invite-only cards
   * the user already holds (e.g. Atlas, Robinhood Gold) still rank, and
   * defaults the rate floors to 0 so every wallet card surfaces.
   */
  walletCardSlugs?: string[];
  /**
   * Per-card user selections (Cash+ picks, Custom Cash top category, etc).
   * Keyed by card slug. When set for a card, `user_choice`/`auto_top_spend`
   * reward blocks match ONLY the user's saved categories — speculative
   * "if you select it" matches are suppressed and confirmed picks rank as
   * direct matches via the new `user_selected` mode.
   */
  userSelections?: UserSelectionsByCard;
}

// Typed runtime re-exports. The JS module has no .d.ts — the casts below
// are the type contract.
type RankerModule = {
  rankCards: (store: Store, cards: Card[], options?: RankCardsOptions) => RankedPick[];
  effectiveCashbackRate: (
    rate: number,
    unit: 'percent' | 'points_per_dollar',
    cardName: string,
  ) => number;
  formatRate: (value: number, unit: 'percent' | 'points_per_dollar') => string;
  labelForCategory: (id: string) => string;
  channelForCategory: (categoryId: string) => Channel;
};

const typedRanker = ranker as unknown as RankerModule;

export const rankCards = typedRanker.rankCards;
export const effectiveCashbackRate = typedRanker.effectiveCashbackRate;
export const formatRate = typedRanker.formatRate;
export const labelForCategory = typedRanker.labelForCategory;
export const channelForCategory = typedRanker.channelForCategory;
