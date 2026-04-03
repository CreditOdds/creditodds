import type { Card, WalletCard } from "@/lib/api";
import type { NewsItem } from "@/lib/news";

interface NamedCardRecord {
  card_name: string;
}

interface NamedOpenReferral {
  card_name: string;
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

export function getEligibleReferralCards<T extends NamedOpenReferral>(
  records: NamedCardRecord[],
  walletCards: WalletCard[],
  openReferrals: T[]
): T[] {
  const recordCardNames = new Set(records.map((record) => record.card_name));
  const walletCardNames = new Set(walletCards.map((walletCard) => walletCard.card_name));

  return openReferrals.filter((card) =>
    recordCardNames.has(card.card_name) || walletCardNames.has(card.card_name)
  );
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
  const cardsWithRecords = new Set(records.map((record) => record.card_name));
  return walletCards.filter((walletCard) => !cardsWithRecords.has(walletCard.card_name));
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
