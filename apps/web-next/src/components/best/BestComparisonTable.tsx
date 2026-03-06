import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@/lib/api';
import { BestPageCard } from '@/lib/best';
import {
  formatAnnualFee,
  formatBonusValue,
  formatEstimatedValue,
  categoryLabels,
} from '@/lib/cardDisplayUtils';

interface EnrichedCard extends BestPageCard {
  card: Card;
}

interface BestComparisonTableProps {
  cards: EnrichedCard[];
}

function getTopRewardLabel(card: Card): string {
  const rewards = card.rewards || [];
  const top = rewards.find(r => r.category !== 'everything_else') || rewards[0];
  if (!top) return '-';
  const label = categoryLabels[top.category] || top.category;
  return `${top.value}${top.unit === 'percent' ? '%' : 'x'} ${label}`;
}

function getBaseRewardLabel(card: Card): string {
  const rewards = card.rewards || [];
  const base = rewards.find(r => r.category === 'everything_else');
  if (!base) return '-';
  return `${base.value}${base.unit === 'percent' ? '%' : 'x'}`;
}

function getBonusDisplay(card: Card): string {
  if (!card.signup_bonus) return '-';
  const val = formatBonusValue(card);
  const est = formatEstimatedValue(card);
  return est ? `${val} (${est})` : val;
}

function getIntroAPR(card: Card): string {
  if (!card.apr) return '-';
  const parts: string[] = [];
  if (card.apr.purchase_intro) {
    parts.push(`${card.apr.purchase_intro.rate}% for ${card.apr.purchase_intro.months}mo`);
  }
  if (card.apr.balance_transfer_intro && (!card.apr.purchase_intro || card.apr.balance_transfer_intro.months !== card.apr.purchase_intro.months)) {
    parts.push(`${card.apr.balance_transfer_intro.rate}% BT for ${card.apr.balance_transfer_intro.months}mo`);
  }
  return parts.length > 0 ? parts.join(', ') : '-';
}

export function BestComparisonTable({ cards }: BestComparisonTableProps) {
  if (cards.length === 0) return null;

  // Determine which columns to show based on data
  const hasBonus = cards.some(e => e.card.signup_bonus);
  const hasIntroAPR = cards.some(e => e.card.apr?.purchase_intro || e.card.apr?.balance_transfer_intro);
  const hasRewards = cards.some(e => (e.card.rewards || []).length > 0);

  return (
    <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-gray-50 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-900">Quick Comparison</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Card</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Annual Fee</th>
              {hasBonus && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Signup Bonus</th>
              )}
              {hasRewards && (
                <>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Top Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Base Rate</th>
                </>
              )}
              {hasIntroAPR && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Intro APR</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {cards.map((entry, index) => {
              const { card } = entry;
              return (
                <tr key={card.slug} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <Link href={`/card/${card.slug}`} className="flex-shrink-0">
                        {card.card_image_link ? (
                          <Image
                            src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`}
                            alt={card.card_name}
                            width={48}
                            height={30}
                            className="rounded shadow-sm"
                          />
                        ) : (
                          <div className="w-12 h-[30px] bg-gray-200 rounded" />
                        )}
                      </Link>
                      <div>
                        <Link href={`/card/${card.slug}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-900">
                          {card.card_name}
                        </Link>
                        {entry.badge && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                            {entry.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                    {formatAnnualFee(card.annual_fee)}
                  </td>
                  {hasBonus && (
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {getBonusDisplay(card)}
                    </td>
                  )}
                  {hasRewards && (
                    <>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        {getTopRewardLabel(card)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        {getBaseRewardLabel(card)}
                      </td>
                    </>
                  )}
                  {hasIntroAPR && (
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {getIntroAPR(card)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
