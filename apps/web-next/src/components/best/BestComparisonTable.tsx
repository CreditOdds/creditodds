import CardImage from '@/components/ui/CardImage';
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

function RankChangeSmall({ currentRank, previousRank }: { currentRank: number; previousRank?: number }) {
  if (!previousRank || previousRank === currentRank) return null;
  const moved = previousRank - currentRank;
  if (moved > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600" title={`Up from #${previousRank}`}>
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" /></svg>
        {moved}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-500" title={`Down from #${previousRank}`}>
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" /></svg>
      {Math.abs(moved)}
    </span>
  );
}

export function BestComparisonTable({ cards }: BestComparisonTableProps) {
  if (cards.length === 0) return null;

  // Determine which columns to show based on data
  const hasBonus = cards.some(e => e.card.signup_bonus);
  const hasIntroAPR = cards.some(e => e.card.apr?.purchase_intro || e.card.apr?.balance_transfer_intro);
  const hasRewards = cards.some(e => (e.card.rewards || []).length > 0);

  return (
    <div className="hidden sm:block mb-8 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-gray-50 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-900">Quick Comparison</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Card</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Annual Fee</th>
              {hasBonus && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Signup Bonus</th>
              )}
              {hasRewards && (
                <>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Top Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Base Rate</th>
                </>
              )}
              {hasIntroAPR && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Intro APR</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {cards.map((entry, index) => {
              const { card } = entry;
              return (
                <tr key={card.slug} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                        {index + 1}
                      </span>
                      <RankChangeSmall currentRank={index + 1} previousRank={entry.previous_rank} />
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-start gap-3 min-w-0">
                      <Link href={`/card/${card.slug}`} className="flex-shrink-0">
                        <CardImage
                          cardImageLink={card.card_image_link}
                          alt={card.card_name}
                          width={48}
                          height={30}
                          className="rounded shadow-sm"
                        />
                      </Link>
                      <div className="min-w-0">
                        <Link
                          href={`/card/${card.slug}`}
                          className="block text-sm font-medium text-indigo-600 hover:text-indigo-900 break-words leading-snug"
                        >
                          {card.card_name}
                        </Link>
                        {entry.badge && (
                          <span className="mt-1 inline-flex max-w-full items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 break-words leading-tight">
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
