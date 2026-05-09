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

import { Card, NearbyPlace, StoreBrandIndexEntry, WalletCard, WalletCardSelection } from '@/lib/api';
import type { Store } from '@/lib/stores';
import { categoryLabels } from '@/lib/cardDisplayUtils';
import { mapPlaceToCategory } from '@/lib/placeTypeMapping';
import { matchPlaceToStoreBrand } from '@/lib/storeFromPlace';
import { formatRate, rankCards, RankedPick, UserSelectionsByCard } from '@/lib/storeRanking';

export interface PlacePick {
  card: Card;
  rateLabel: string;
  context: string;
}

export interface UnconfiguredCardPrompt {
  /** Wallet row id — used as the target for the SelectionsModal. */
  walletRowId: number;
  cardSlug: string;
  cardName: string;
  cardImageLink?: string;
  /** Best rate the card *could* earn here if the user picks the matching category. */
  potentialRate: number;
  potentialUnit: 'percent' | 'points_per_dollar';
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
  /**
   * Held cards that *could* match this merchant via a `user_choice` /
   * `auto_top_spend` reward but the user hasn't told us which categories
   * they picked. Surfaced as inline prompts so the user can configure
   * them and unlock the rate.
   */
  unconfiguredCards: UnconfiguredCardPrompt[];
}

function rankedToPick(r: RankedPick): PlacePick {
  return {
    card: r.card,
    rateLabel: formatRate(r.rate, r.unit),
    context: r.reason,
  };
}

function buildSyntheticCategoryStore(categories: string[]): Store {
  return {
    // Empty slug means rankCards' merchant_gate check (`!storeSlug`) will
    // reject every gated reward — exactly what we want when the merchant
    // isn't a recognized brand.
    slug: '',
    name: 'category',
    categories,
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

/**
 * Reward blocks a user must configure to unlock category bonuses on a card.
 * Returns one entry per `user_choice` / `auto_top_spend` reward block.
 */
function selectableBlocks(card: Card): Array<{ category: string; rate: number; unit: 'percent' | 'points_per_dollar'; eligible: string[] }> {
  if (!card.rewards) return [];
  return card.rewards
    .filter((r) => r.mode === 'user_choice' || r.mode === 'auto_top_spend' || r.category === 'top_category')
    .map((r) => ({
      category: r.category,
      rate: r.value,
      unit: (r.unit as 'percent' | 'points_per_dollar') ?? 'percent',
      eligible: r.eligible_categories || [],
    }));
}

interface WalletCardWithSelections extends WalletCard {
  selections?: WalletCardSelection[];
}

export function pickWalletCardsForPlace(
  walletCards: WalletCardWithSelections[],
  allCards: Card[],
  place: NearbyPlace,
  brandIndex: StoreBrandIndexEntry[],
): PlaceMatchResult | null {
  const categoryMatch = mapPlaceToCategory({
    name: place.name,
    primaryType: place.primaryType ?? undefined,
    types: place.types,
  });
  if (categoryMatch.primary === 'everything_else') return null;
  // The merchant's primary slug labels the row; the full category list
  // (primary + issuer-specific subtypes like `movie_theaters`) is what we
  // match against card rewards and user selections so a Cash+ "Movie
  // Theaters" pick actually fires at an AMC.
  const categoryId = categoryMatch.primary;
  const merchantCategories = categoryMatch.categories;

  // Map wallet rows to their card slugs (skipping any that don't resolve).
  // Keep the wallet row alongside so we can build prompts and selection maps.
  type Resolved = { wallet: WalletCardWithSelections; card: Card };
  const resolved: Resolved[] = walletCards
    .map((wc): Resolved | null => {
      const card = allCards.find((c) => c.card_name === wc.card_name);
      return card ? { wallet: wc, card } : null;
    })
    .filter((r): r is Resolved => r !== null);

  if (resolved.length === 0) return null;

  // Split resolved cards into: configured-or-irrelevant (rankable) vs
  // unconfigured-with-overlap (prompt). A card "needs a prompt" only when
  // at least one of its selectable reward blocks (a) covers this merchant
  // category and (b) has no saved selection.
  const rankableSlugs: string[] = [];
  const userSelections: UserSelectionsByCard = new Map();
  const unconfiguredCards: UnconfiguredCardPrompt[] = [];
  const unconfiguredSlugs = new Set<string>();

  for (const { wallet, card } of resolved) {
    const blocks = selectableBlocks(card);
    // A block touches this merchant when its eligible_categories overlap
    // ANY of the merchant's categories — primary OR issuer-specific subtype.
    // E.g. an AMC with categories=['entertainment','movie_theaters'] is
    // touched by Cash+ 5% (which lists 'movie_theaters') even though the
    // generic 'entertainment' isn't on Cash+'s 5% list.
    const blocksTouchingMerchant = blocks.filter((b) =>
      b.eligible.some((c) => merchantCategories.includes(c)),
    );

    // Of the blocks that overlap with this merchant's category, which are
    // unconfigured? Match selection rows by (reward_category, reward_rate).
    const sels = wallet.selections || [];
    const unconfiguredOverlap = blocksTouchingMerchant.filter((b) => {
      return !sels.some((s) => s.reward_category === b.category && s.reward_rate === b.rate);
    });

    if (unconfiguredOverlap.length > 0) {
      // Headline rate = highest-value unconfigured overlap.
      const headline = unconfiguredOverlap.reduce((a, b) => (b.rate > a.rate ? b : a));
      unconfiguredCards.push({
        walletRowId: wallet.id,
        cardSlug: card.slug,
        cardName: card.card_name,
        cardImageLink: card.card_image_link,
        potentialRate: headline.rate,
        potentialUnit: headline.unit,
      });
      unconfiguredSlugs.add(card.slug);
      continue;
    }

    rankableSlugs.push(card.slug);
    if (sels.length > 0) userSelections.set(card.slug, sels);
  }

  if (rankableSlugs.length === 0 && unconfiguredCards.length === 0) return null;

  const brandMatch = matchPlaceToStoreBrand(place.name, categoryId, brandIndex);
  const store = brandMatch ? buildBrandStore(brandMatch.store) : buildSyntheticCategoryStore(merchantCategories);

  const ranked = rankableSlugs.length > 0
    ? rankCards(store, allCards, {
        walletCardSlugs: rankableSlugs,
        userSelections,
        maxPicks: 2,
      })
    : [];

  const label = brandMatch
    ? brandMatch.store.name.toLowerCase()
    : (categoryLabels[categoryId]?.toLowerCase() ?? categoryId);

  // No rankable picks AND no prompts → caller drops the merchant entirely.
  if (ranked.length === 0 && unconfiguredCards.length === 0) return null;

  // No rankable picks but prompts exist → still surface the merchant so the
  // user can configure their cards and unlock matches.
  if (ranked.length === 0) {
    const top = unconfiguredCards.reduce((a, b) => (b.potentialRate > a.potentialRate ? b : a));
    return {
      best: {
        // Synthetic placeholder pick — the UI replaces this row with a prompt
        // when `best.context` starts with the prompt sentinel.
        card: {
          card_name: top.cardName,
          slug: top.cardSlug,
          card_image_link: top.cardImageLink,
        } as Card,
        rateLabel: formatRate(top.potentialRate, top.potentialUnit),
        context: `pick categories on ${top.cardName} to unlock`,
      },
      label,
      brandSlug: brandMatch?.store.slug ?? null,
      categoryId,
      unconfiguredCards,
    };
  }

  return {
    best: rankedToPick(ranked[0]),
    next: ranked[1] ? rankedToPick(ranked[1]) : undefined,
    label,
    brandSlug: brandMatch?.store.slug ?? null,
    categoryId,
    unconfiguredCards,
  };
}
