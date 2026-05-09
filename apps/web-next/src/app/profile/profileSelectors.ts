import type { Card, WalletCard } from "@/lib/api";
import type { NewsItem } from "@/lib/news";

interface NamedCardRecord {
  card_name: string;
}

export interface EligibleReferralCard {
  card_id: string;
  card_name: string;
  card_image_link?: string;
  card_referral_link?: string;
}

export interface CardLookups {
  byName: Map<string, Card>;
  byWalletId: Map<number, Card>;
}

export function createCardLookups(allCards: Card[]): CardLookups {
  const byName = new Map<string, Card>();
  const byWalletId = new Map<number, Card>();

  for (const card of allCards) {
    byName.set(card.card_name, card);

    const primaryId = Number(card.card_id);
    if (!Number.isNaN(primaryId)) {
      byWalletId.set(primaryId, card);
    }

    if (card.db_card_id !== undefined) {
      byWalletId.set(card.db_card_id, card);
    }
  }

  return { byName, byWalletId };
}

function getCardForWalletCard(walletCard: WalletCard, lookups: CardLookups) {
  return lookups.byWalletId.get(walletCard.card_id) ?? lookups.byName.get(walletCard.card_name);
}

export function getEligibleReferralCards(
  records: NamedCardRecord[],
  walletCards: WalletCard[],
  activeReferrals: { card_name: string }[],
  lookups: CardLookups
): EligibleReferralCard[] {
  const excluded = new Set(activeReferrals.map((r) => r.card_name));
  const seen = new Set<string>();
  const result: EligibleReferralCard[] = [];

  for (const w of walletCards) {
    if (excluded.has(w.card_name) || seen.has(w.card_name)) continue;
    const card = lookups.byName.get(w.card_name);
    if (card?.active === false) continue;
    seen.add(w.card_name);
    result.push({
      card_id: String(w.card_id),
      card_name: w.card_name,
      card_image_link: w.card_image_link ?? card?.card_image_link,
      card_referral_link: card?.card_referral_link,
    });
  }

  for (const r of records) {
    if (excluded.has(r.card_name) || seen.has(r.card_name)) continue;
    const card = lookups.byName.get(r.card_name);
    if (!card) continue;
    if (card.active === false) continue;
    const dbId = card.db_card_id ?? Number(card.card_id);
    if (!Number.isFinite(dbId)) continue;
    seen.add(r.card_name);
    result.push({
      card_id: String(dbId),
      card_name: r.card_name,
      card_image_link: card.card_image_link,
      card_referral_link: card.card_referral_link,
    });
  }

  result.sort((a, b) => a.card_name.localeCompare(b.card_name));
  return result;
}

export function getTotalAnnualFees(walletCards: WalletCard[], lookups: CardLookups) {
  return walletCards.reduce((total, walletCard) => {
    const card = getCardForWalletCard(walletCard, lookups);
    return total + (card?.annual_fee || 0);
  }, 0);
}

export function getWalletVisibility(walletCards: WalletCard[], lookups: CardLookups, showInactiveCards: boolean) {
  const activeWalletCards: WalletCard[] = [];
  let inactiveCount = 0;

  for (const walletCard of walletCards) {
    const card = getCardForWalletCard(walletCard, lookups);
    if (card?.active === false) {
      inactiveCount++;
      if (showInactiveCards) {
        activeWalletCards.push(walletCard);
      }
      continue;
    }

    activeWalletCards.push(walletCard);
  }

  return { activeWalletCards, inactiveCount };
}

export function isCardInactive(cardName: string, lookups: CardLookups) {
  return lookups.byName.get(cardName)?.active === false;
}

export function getEligibleRecordCards<T extends NamedCardRecord>(walletCards: WalletCard[], records: T[]) {
  // Dedupe by card_name — records are keyed by card_name, so showing two copies of the
  // same card in the picker would be confusing and the second pick would be a no-op.
  const cardsWithRecords = new Set(records.map((record) => record.card_name));
  const seen = new Set<string>();
  const result: WalletCard[] = [];
  for (const walletCard of walletCards) {
    if (cardsWithRecords.has(walletCard.card_name)) continue;
    if (seen.has(walletCard.card_name)) continue;
    seen.add(walletCard.card_name);
    result.push(walletCard);
  }
  return result;
}

/**
 * Returns one wallet row per unique card_name. Used by consumers that aggregate by card
 * type (benefits, best-card-by-category, best-card-here, referrals) — duplicates would
 * double-count credits or pit a card against itself.
 *
 * Keeps the oldest instance (earliest acquired_year/month, then earliest created_at).
 */
export function dedupeWalletByCardName(walletCards: WalletCard[]): WalletCard[] {
  const byName = new Map<string, WalletCard>();
  for (const card of walletCards) {
    const existing = byName.get(card.card_name);
    if (!existing) {
      byName.set(card.card_name, card);
      continue;
    }
    if (compareWalletCardsByAge(card, existing) < 0) {
      byName.set(card.card_name, card);
    }
  }
  return Array.from(byName.values());
}

function compareWalletCardsByAge(a: WalletCard, b: WalletCard): number {
  // Earlier first. Cards with no acquired date sort after dated cards.
  const aDated = a.acquired_year ? a.acquired_year * 12 + (a.acquired_month ?? 0) : Infinity;
  const bDated = b.acquired_year ? b.acquired_year * 12 + (b.acquired_month ?? 0) : Infinity;
  if (aDated !== bDated) return aDated - bDated;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

/**
 * Map of wallet row id -> display name. When the user holds more than one of the same
 * card type, instances get an "A", "B", "C"… suffix in chronological order. Single-copy
 * cards keep the plain card_name.
 */
export function getWalletDisplayNames(walletCards: WalletCard[]): Map<number, string> {
  const groups = new Map<string, WalletCard[]>();
  for (const card of walletCards) {
    const list = groups.get(card.card_name) ?? [];
    list.push(card);
    groups.set(card.card_name, list);
  }

  const display = new Map<number, string>();
  for (const [name, list] of groups) {
    if (list.length === 1) {
      display.set(list[0].id, name);
      continue;
    }
    const sorted = [...list].sort(compareWalletCardsByAge);
    sorted.forEach((card, idx) => {
      const suffix = String.fromCharCode(65 + idx); // A, B, C…
      display.set(card.id, `${name} ${suffix}`);
    });
  }
  return display;
}

// Tags relevant to existing cardholders (exclude signup bonus / new card news)
const CARDHOLDER_RELEVANT_TAGS = new Set([
  'benefit-change',
  'fee-change',
  'policy-change',
  'discontinued',
]);

export function getRelevantNews(walletCards: WalletCard[], newsItems: NewsItem[], lookups: CardLookups) {
  const walletCardSlugs = new Set<string>();

  for (const walletCard of walletCards) {
    const card = getCardForWalletCard(walletCard, lookups);
    if (card?.slug) {
      walletCardSlugs.add(card.slug);
    }
  }

  return newsItems.filter((newsItem) =>
    newsItem.card_slugs?.some((slug) => walletCardSlugs.has(slug))
    && newsItem.tags?.some((tag) => CARDHOLDER_RELEVANT_TAGS.has(tag))
  );
}
