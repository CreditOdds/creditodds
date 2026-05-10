// Unified wallet-aware "best card here" matcher. Funnels every Google
// Places result through the same ranking engine that powers the
// /best-card-for/[slug] pages (rankCards) so brand-gated rewards behave
// consistently:
//
//   - "Marriott Bayside" -> Marriott store -> Marriott Bonvoy Boundless 6x
//     surfaces (gate matches), co-brand cards prefer.
//   - "Hilton Garden Inn" -> Hilton store -> Hilton Honors Surpass 6x.
//   - "Joe's Coffee" -> no brand match -> synthetic dining store with
//     empty slug, so merchant-gated rewards (Boundless 6x) are skipped
//     and the user's best dining card surfaces instead.

const { mapPlaceToCategory } = require("./placeTypeMapping");
const { matchPlaceToStoreBrand } = require("./storeFromPlace");
const {
  effectiveCashbackRate,
  formatRate,
  rankCards,
} = require("./storeRanking");
const { categoryLabels } = require("./categoryLabels");

function rankedToPick(r) {
  return {
    card: r.card,
    rateLabel: formatRate(r.rate, r.unit),
    context: r.reason,
    effectiveRate: r.effectiveRate,
    unit: r.unit,
  };
}

function buildSyntheticCategoryStore(categories) {
  // Empty slug means rankCards' merchant_gate check (`!storeSlug`) will
  // reject every gated reward — exactly what we want when the merchant
  // isn't a recognized brand.
  return {
    slug: "",
    name: "category",
    categories,
    intro: "",
  };
}

function buildBrandStore(brand) {
  return {
    slug: brand.slug,
    name: brand.name,
    categories: brand.categories,
    co_brand_cards: brand.co_brand_cards,
    intro: "",
  };
}

// Reward blocks a user must configure to unlock category bonuses on a card.
// Returns one entry per `user_choice` / `auto_top_spend` reward block.
function selectableBlocks(card) {
  if (!card.rewards) return [];
  return card.rewards
    .filter((r) => r.mode === "user_choice" || r.mode === "auto_top_spend" || r.category === "top_category")
    .map((r) => ({
      category: r.category,
      rate: r.value,
      unit: r.unit ?? "percent",
      eligible: r.eligible_categories || [],
    }));
}

// walletCards: Array<{ id, card_name, selections?: WalletCardSelection[] }>
// allCards:    Array<Card>
// place:       { id, name, primaryType, types, address, lat, lng }
// brandIndex:  Array<StoreBrandIndexEntry>
// Returns:     PlaceMatchResult | null
function pickWalletCardsForPlace(walletCards, allCards, place, brandIndex) {
  const categoryMatch = mapPlaceToCategory({
    name: place.name,
    primaryType: place.primaryType ?? undefined,
    types: place.types,
  });
  if (categoryMatch.primary === "everything_else") return null;
  const categoryId = categoryMatch.primary;
  const merchantCategories = categoryMatch.categories;

  const resolved = walletCards
    .map((wc) => {
      const card = allCards.find((c) => c.card_name === wc.card_name);
      return card ? { wallet: wc, card } : null;
    })
    .filter((r) => r !== null);

  if (resolved.length === 0) return null;

  const rankableSlugs = [];
  const userSelections = new Map();
  const unconfiguredCards = [];
  const unconfiguredSlugs = new Set();

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

    const sels = wallet.selections || [];
    const unconfiguredOverlap = blocksTouchingMerchant.filter((b) => {
      return !sels.some((s) => s.reward_category === b.category && s.reward_rate === b.rate);
    });

    if (unconfiguredOverlap.length > 0) {
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

  if (ranked.length === 0 && unconfiguredCards.length === 0) return null;

  if (ranked.length === 0) {
    const top = unconfiguredCards.reduce((a, b) => (b.potentialRate > a.potentialRate ? b : a));
    return {
      best: {
        card: {
          card_name: top.cardName,
          slug: top.cardSlug,
          card_image_link: top.cardImageLink,
        },
        rateLabel: formatRate(top.potentialRate, top.potentialUnit),
        context: `pick categories on ${top.cardName} to unlock`,
        effectiveRate: effectiveCashbackRate(top.potentialRate, top.potentialUnit, top.cardName),
        unit: top.potentialUnit,
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

module.exports = { pickWalletCardsForPlace };
