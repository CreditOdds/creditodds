// Unified wallet-aware "best card here" matcher. Funnels every Google
// Places result through the same ranking engine that powers the
// /store/[slug] pages (rankCards) so brand-gated rewards behave the way
// they do everywhere else on the site:
//
//   - "Marriott Bayside" -> Marriott store -> Marriott Bonvoy Boundless 6x
//     surfaces (gate matches), co-brand cards prefer.
//   - "Hilton Garden Inn" -> Hilton store -> Hilton Honors Surpass 6x.
//   - "Joe's Coffee" -> no brand match -> synthetic dining store with
//     empty slug, so merchant-gated rewards (Boundless 6x) are skipped
//     and the user's best dining card surfaces instead.
//
// This replaces the older walletPicksForCategory.ts which ignored
// `merchant_gate` and recommended Boundless 6x at any hotel.

import { Card, NearbyPlace, StoreBrandIndexEntry, WalletCard } from '@/lib/api';
import type { Store } from '@/lib/stores';
import { categoryLabels } from '@/lib/cardDisplayUtils';
import { mapPlaceToCategory } from '@/lib/placeTypeMapping';
import { matchPlaceToStoreBrand } from '@/lib/storeFromPlace';
import { formatRate, rankCards, RankedPick } from '@/lib/storeRanking';

export interface PlacePick {
  card: Card;
  rateLabel: string;
  context: string;
}

export interface PlaceMatchResult {
  best: PlacePick;
  next?: PlacePick;
  /** Subtitle for the merchant row — brand name when matched, else category. */
  label: string;
  /** Slug of the matched store brand, when there was one. */
  brandSlug: string | null;
  /** Resolved reward category id (e.g. "hotels", "dining"). */
  categoryId: string;
}

function rankedToPick(r: RankedPick): PlacePick {
  return {
    card: r.card,
    rateLabel: formatRate(r.rate, r.unit),
    context: r.reason,
  };
}

function buildSyntheticCategoryStore(category: string): Store {
  return {
    // Empty slug means rankCards' merchant_gate check (`!storeSlug`) will
    // reject every gated reward — exactly what we want when the merchant
    // isn't a recognized brand.
    slug: '',
    name: 'category',
    categories: [category],
    intro: '',
  };
}

function buildBrandStore(brand: StoreBrandIndexEntry): Store {
  return {
    slug: brand.slug,
    name: brand.name,
    categories: brand.categories,
    co_brand_cards: brand.co_brand_cards,
    intro: '',
  };
}

export function pickWalletCardsForPlace(
  walletCards: WalletCard[],
  allCards: Card[],
  place: NearbyPlace,
  brandIndex: StoreBrandIndexEntry[],
): PlaceMatchResult | null {
  const categoryMatch = mapPlaceToCategory({
    name: place.name,
    primaryType: place.primaryType ?? undefined,
    types: place.types,
  });
  if (categoryMatch.category === 'everything_else') return null;
  const categoryId = categoryMatch.category;

  const walletCardSlugs = walletCards
    .map((wc) => allCards.find((c) => c.card_name === wc.card_name)?.slug)
    .filter((s): s is string => !!s);
  if (walletCardSlugs.length === 0) return null;

  const brandMatch = matchPlaceToStoreBrand(place.name, categoryId, brandIndex);

  const store = brandMatch
    ? buildBrandStore(brandMatch.store)
    : buildSyntheticCategoryStore(categoryId);

  const ranked = rankCards(store, allCards, {
    walletCardSlugs,
    maxPicks: 2,
  });
  if (ranked.length === 0) return null;

  const label = brandMatch
    ? brandMatch.store.name.toLowerCase()
    : (categoryLabels[categoryId]?.toLowerCase() ?? categoryId);

  return {
    best: rankedToPick(ranked[0]),
    next: ranked[1] ? rankedToPick(ranked[1]) : undefined,
    label,
    brandSlug: brandMatch?.store.slug ?? null,
    categoryId,
  };
}
