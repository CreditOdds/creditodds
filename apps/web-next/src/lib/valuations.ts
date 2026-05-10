// TypeScript surface for the points/miles valuation table. The implementation
// lives in apps/api/src/lib/ranker/valuations.js (single source of truth,
// shared with the Lambda wallet-picks handlers via the same `@ranker/*`
// tsconfig alias used by storeRanking.ts).
//
// The JS module has no JSDoc types — the type assertions below are the spec.
// If you change a signature, update both this file AND the JS twin to match.
// Data edits (CPP, match strings, new programs) only happen in the JS module.

import * as ranker from '@ranker/valuations';

export interface Valuation {
  program: string;
  slug: string;
  cpp: number;
  match: string[];
  exclude?: string[];
  /** Path segment for /tools/<toolSlug>-to-usd. */
  toolSlug?: string;
}

type ValuationsModule = {
  getValuation: (cardName: string) => number;
  getValuationDetails: (cardName: string) => Valuation | undefined;
  getValuationBySlug: (slug: string) => Valuation | undefined;
  getAllValuations: () => Valuation[];
};

const typedRanker = ranker as unknown as ValuationsModule;

export const getValuation = typedRanker.getValuation;
export const getValuationDetails = typedRanker.getValuationDetails;
export const getValuationBySlug = typedRanker.getValuationBySlug;
export const getAllValuations = typedRanker.getAllValuations;
