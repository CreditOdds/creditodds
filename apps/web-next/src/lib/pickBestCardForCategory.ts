import { Card, Reward, WalletCard } from '@/lib/api';
import { getRewardUsdRate } from '@/lib/cardDisplayUtils';

export interface CategoryPick {
  card: Card;
  reward: Reward;
  usdRate: number;
  rotating?: boolean;
  staleRotation?: boolean;
  slotNote?: string;
}

function currentQuarterLabel(now: Date = new Date()): string {
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `Q${q} ${now.getUTCFullYear()}`;
}

function isStaleRotation(reward: Reward, expected: string): boolean {
  if (reward.mode !== 'quarterly_rotating') return false;
  const cur = reward.current_period;
  if (!cur) return true;
  return cur.trim().toUpperCase() !== expected.toUpperCase();
}

// Returns the highest-earning card in the user's wallet for a given reward
// category, plus an optional alternative when the primary pick is conditional
// (merchant-specific or note-restricted). Mirrors the per-category logic in
// BestCardByCategory.tsx so the Nearby feature can reuse it row-by-row.
export function pickBestCardForCategory(
  walletCards: WalletCard[],
  allCards: Card[],
  category: string,
): { primary: CategoryPick; alternative?: CategoryPick } | null {
  if (!category) return null;

  const walletCardData = walletCards
    .map((wc) => allCards.find((c) => c.card_name === wc.card_name))
    .filter((c): c is Card => c !== undefined && !!c.rewards && c.rewards.length > 0);

  if (walletCardData.length === 0) return null;

  const expectedQuarter = currentQuarterLabel();
  const picks: CategoryPick[] = [];

  for (const card of walletCardData) {
    const permanentRates = new Map<string, number>();
    for (const reward of card.rewards!) {
      if (reward.mode === 'quarterly_rotating') continue;
      const r = getRewardUsdRate(reward, card);
      const prev = permanentRates.get(reward.category) ?? 0;
      if (r > prev) permanentRates.set(reward.category, r);
    }

    for (const reward of card.rewards!) {
      const usdRate = getRewardUsdRate(reward, card);

      if (
        reward.mode === 'quarterly_rotating' &&
        reward.current_categories &&
        reward.current_categories.length > 0
      ) {
        const stale = isStaleRotation(reward, expectedQuarter);
        for (const entry of reward.current_categories) {
          const cat = typeof entry === 'string' ? entry : entry.category;
          const slotNote = typeof entry === 'string' ? undefined : entry.note;
          if (cat !== category) continue;
          const perm = permanentRates.get(cat) ?? 0;
          if (perm >= usdRate) continue;
          picks.push({ card, reward, usdRate, rotating: true, staleRotation: stale, slotNote });
        }
        continue;
      }

      if (reward.category === category) {
        picks.push({ card, reward, usdRate });
      }
    }
  }

  // If nothing matches the requested category, fall back to everything_else
  // so we always surface at least the user's best baseline card.
  if (picks.length === 0 && category !== 'everything_else') {
    return pickBestCardForCategory(walletCards, allCards, 'everything_else');
  }

  if (picks.length === 0) return null;

  picks.sort((a, b) => b.usdRate - a.usdRate);
  const primary = picks[0];

  let alternative: CategoryPick | undefined;
  const isConditional = (r: Reward) =>
    r.merchant_specific === true || (!!r.note && r.note.trim().length > 0);

  if (isConditional(primary.reward)) {
    alternative = picks.find(
      (p) => !isConditional(p.reward) && p.card.card_name !== primary.card.card_name,
    );
  }

  return { primary, alternative };
}
