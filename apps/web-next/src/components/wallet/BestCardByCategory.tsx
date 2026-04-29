'use client';

import { useMemo } from 'react';
import CardImage from '@/components/ui/CardImage';
import { Card, WalletCard, Reward } from '@/lib/api';
import { formatRewardWithUsdEquivalent, getRewardUsdRate } from '@/lib/cardDisplayUtils';

const categoryLabels: Record<string, string> = {
  dining: "Dining",
  groceries: "Groceries",
  travel: "Travel",
  gas: "Gas",
  streaming: "Streaming",
  transit: "Transit",
  drugstores: "Drugstores",
  home_improvement: "Home Improvement",
  online_shopping: "Online Shopping",
  hotels: "Hotels",
  airlines: "Airlines",
  car_rentals: "Car Rentals",
  entertainment: "Entertainment",
  rotating: "Rotating Categories",
  travel_portal: "Travel (via Portal)",
  hotels_portal: "Hotels (via Portal)",
  flights_portal: "Flights (via Portal)",
  hotels_car_portal: "Hotels & Car Rentals (via Portal)",
  amazon: "Amazon.com",
  rei: "REI",
};

const canonicalOrder = Object.keys(categoryLabels);

interface BestCardByCategoryProps {
  walletCards: WalletCard[];
  allCards: Card[];
}

interface CategoryBest {
  category: string;
  label: string;
  card: Card;
  reward: Reward;
}

export default function BestCardByCategory({ walletCards, allCards }: BestCardByCategoryProps) {
  const categoryBests = useMemo(() => {
    if (walletCards.length === 0 || allCards.length === 0) return [];

    // Join wallet cards to full card data
    const walletCardData = walletCards
      .map(wc => allCards.find(c => c.card_name === wc.card_name))
      .filter((c): c is Card => c !== undefined && !!c.rewards && c.rewards.length > 0);

    if (walletCardData.length === 0) return [];

    // For each category, find the card with the highest reward value
    const bestByCategory = new Map<string, { card: Card; reward: Reward; usdRate: number }>();

    for (const card of walletCardData) {
      for (const reward of card.rewards!) {
        if (reward.category === 'everything_else') continue;
        const usdRate = getRewardUsdRate(reward, card);

        const existing = bestByCategory.get(reward.category);
        if (!existing || usdRate > existing.usdRate) {
          bestByCategory.set(reward.category, { card, reward, usdRate });
        }
      }
    }

    // Sort by canonical order
    const results: CategoryBest[] = [];
    for (const category of canonicalOrder) {
      const best = bestByCategory.get(category);
      if (best) {
        results.push({
          category,
          label: categoryLabels[category] || category,
          card: best.card,
          reward: best.reward,
        });
      }
    }

    // Add any categories not in canonical order
    for (const [category, best] of bestByCategory) {
      if (!canonicalOrder.includes(category)) {
        results.push({
          category,
          label: categoryLabels[category] || category,
          card: best.card,
          reward: best.reward,
        });
      }
    }

    return results;
  }, [walletCards, allCards]);

  if (categoryBests.length === 0) return null;

  return (
    <div className="bg-white shadow rounded-lg p-6 mt-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Best Card by Category
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 align-middle">Experimental</span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">Which card in your wallet earns the most for each spending category</p>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Best Card</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Rate</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {categoryBests.map(({ category, label, card, reward }) => (
              <tr key={category}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                  {label}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 h-8 w-12 relative">
                      <CardImage
                        cardImageLink={card.card_image_link}
                        alt={card.card_name}
                        fill
                        className="object-contain"
                        sizes="48px"
                      />
                    </div>
                    <span className="text-sm text-gray-900">{card.card_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    reward.unit === 'percent'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-indigo-100 text-indigo-800'
                  }`}>
                    {formatRewardWithUsdEquivalent(reward, card)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile layout */}
      <div className="sm:hidden divide-y divide-gray-200">
        {categoryBests.map(({ category, label, card, reward }) => (
          <div key={category} className="flex items-center justify-between py-3">
            <span className="text-sm font-medium text-gray-900">{label}</span>
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0 h-6 w-10 relative">
                <CardImage
                  cardImageLink={card.card_image_link}
                  alt={card.card_name}
                  fill
                  className="object-contain"
                  sizes="40px"
                />
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                reward.unit === 'percent'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-indigo-100 text-indigo-800'
              }`}>
                {formatRewardWithUsdEquivalent(reward, card)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
