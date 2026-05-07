import { Card, Reward, WalletCard } from '@/lib/api';
import { categoryLabels, getRewardUsdRate } from '@/lib/cardDisplayUtils';

export interface WalletPick {
  card: Card;
  reward: Reward;
  usdRate: number;
  rateLabel: string;
  context: string;
  isCategoryMatch: boolean;
}

function rateLabel(reward: Reward): string {
  const v = reward.value;
  const fmt = Number.isInteger(v) ? `${v}` : v.toFixed(1).replace(/\.0$/, '');
  return reward.unit === 'percent' ? `${fmt}%` : `${fmt}x`;
}

function findBestRewardForCategory(card: Card, category: string): Reward | null {
  if (!card.rewards) return null;
  let best: Reward | null = null;
  let bestRate = 0;
  for (const reward of card.rewards) {
    let matches = reward.category === category;
    if (
      !matches &&
      reward.mode === 'quarterly_rotating' &&
      reward.current_categories
    ) {
      matches = reward.current_categories.some((entry) =>
        (typeof entry === 'string' ? entry : entry.category) === category,
      );
    }
    if (!matches) continue;
    const rate = getRewardUsdRate(reward, card);
    if (rate > bestRate) {
      bestRate = rate;
      best = reward;
    }
  }
  return best;
}

function findEverythingElseReward(card: Card): Reward | null {
  if (!card.rewards) return null;
  let best: Reward | null = null;
  let bestRate = 0;
  for (const reward of card.rewards) {
    if (reward.category !== 'everything_else') continue;
    const rate = getRewardUsdRate(reward, card);
    if (rate > bestRate) {
      bestRate = rate;
      best = reward;
    }
  }
  return best;
}

// Picks the best and runner-up cards from the user's wallet for a given
// reward category (lowercase id, e.g. "dining"). A card with a matching
// category reward always ranks above one whose only contribution is its
// everything_else baseline. Returns null when the wallet has no card with
// a usable reward at all.
export function pickWalletCardsForCategory(
  walletCards: WalletCard[],
  allCards: Card[],
  category: string,
): { best: WalletPick; next?: WalletPick } | null {
  const wallet = walletCards
    .map((wc) => allCards.find((c) => c.card_name === wc.card_name))
    .filter((c): c is Card => !!c && !!c.rewards && c.rewards.length > 0);

  if (wallet.length === 0) return null;

  type Scored = {
    card: Card;
    reward: Reward;
    usdRate: number;
    isCategoryMatch: boolean;
  };
  const scored: Scored[] = [];

  for (const card of wallet) {
    const direct = findBestRewardForCategory(card, category);
    if (direct) {
      scored.push({
        card,
        reward: direct,
        usdRate: getRewardUsdRate(direct, card),
        isCategoryMatch: true,
      });
      continue;
    }
    const baseline = findEverythingElseReward(card);
    if (baseline) {
      scored.push({
        card,
        reward: baseline,
        usdRate: getRewardUsdRate(baseline, card),
        isCategoryMatch: false,
      });
    }
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (a.isCategoryMatch !== b.isCategoryMatch) return b.isCategoryMatch ? 1 : -1;
    return b.usdRate - a.usdRate;
  });

  const toPick = (s: Scored): WalletPick => {
    const label = categoryLabels[category]?.toLowerCase() ?? category;
    return {
      card: s.card,
      reward: s.reward,
      usdRate: s.usdRate,
      rateLabel: rateLabel(s.reward),
      context: s.isCategoryMatch ? label : 'everything else',
      isCategoryMatch: s.isCategoryMatch,
    };
  };

  return {
    best: toPick(scored[0]),
    next: scored[1] ? toPick(scored[1]) : undefined,
  };
}
