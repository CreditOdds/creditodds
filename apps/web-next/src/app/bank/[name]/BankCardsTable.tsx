'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { Card, Reward } from '@/lib/api';
import { categoryLabels, CategoryIcon } from '@/lib/cardDisplayUtils';

interface BankCardsTableProps {
  cards: Card[];
  trendingViews?: Record<number, number>;
}

function getTopReward(rewards: Reward[] | undefined): Reward | null {
  if (!rewards || rewards.length === 0) return null;
  const sorted = [...rewards].sort((a, b) => b.value - a.value);
  const best = sorted.find(r => r.category !== 'everything_else');
  return best || sorted[0];
}

export default function BankCardsTable({ cards, trendingViews }: BankCardsTableProps) {
  const [showArchived, setShowArchived] = useState(false);

  // Count active and archived cards
  const { activeCount, archivedCount } = useMemo(() => {
    let active = 0;
    let archived = 0;
    cards.forEach(card => {
      if (card.accepting_applications) {
        active++;
      } else {
        archived++;
      }
    });
    return { activeCount: active, archivedCount: archived };
  }, [cards]);

  // Filter and sort cards
  const filteredCards = useMemo(() => {
    return cards
      .filter(card => showArchived || card.accepting_applications)
      .sort((a, b) => {
        // Active cards first
        if (a.accepting_applications !== b.accepting_applications) {
          return a.accepting_applications ? -1 : 1;
        }
        // Then by trending views (descending)
        const aViews = trendingViews?.[Number(a.db_card_id || a.card_id)] || 0;
        const bViews = trendingViews?.[Number(b.db_card_id || b.card_id)] || 0;
        if (aViews !== bViews) return bViews - aViews;
        return a.card_name.localeCompare(b.card_name);
      });
  }, [cards, showArchived, trendingViews]);

  return (
    <div>
      {/* Filter controls */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {filteredCards.length} card{filteredCards.length !== 1 ? 's' : ''}
          {!showArchived && archivedCount > 0 && ` (${archivedCount} archived hidden)`}
        </p>
        {archivedCount > 0 && (
          <label className="inline-flex items-center cursor-pointer">
            <span className="mr-3 text-sm text-gray-500">
              Show archived ({archivedCount})
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={showArchived}
              onClick={() => setShowArchived(!showArchived)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${
                showArchived ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  showArchived ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
        )}
      </div>

      {/* Cards table */}
      <div className="overflow-hidden sm:shadow sm:ring-1 sm:ring-black sm:ring-opacity-5 sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                Card
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 hidden sm:table-cell">
                Annual Fee
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 hidden sm:table-cell">
                Reward Type
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 hidden lg:table-cell">
                Top Reward
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 hidden lg:table-cell">
                Signup Bonus
              </th>
              <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 hidden sm:table-cell">
                Approval Rate
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredCards.map((card) => (
              <tr key={card.card_id} className="hover:bg-gray-50">
                <td className="py-3 pl-3 pr-2 sm:py-4 sm:pl-6 sm:pr-3">
                  <Link href={`/card/${card.slug}`} className="flex items-center group">
                    <div className="h-8 w-12 sm:h-10 sm:w-16 flex-shrink-0 mr-3">
                      <CardImage
                        cardImageLink={card.card_image_link}
                        alt={card.card_name}
                        width={64}
                        height={40}
                        className="h-8 w-12 sm:h-10 sm:w-16 object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-indigo-600 group-hover:text-indigo-900 sm:truncate">
                        {card.card_name}
                      </div>
                      <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-1.5 sm:hidden">
                        {card.annual_fee !== undefined && card.annual_fee > 0 && (
                          <span className="text-amber-600 font-medium">${card.annual_fee}/yr</span>
                        )}
                        {card.reward_type && (
                          <span>
                            {card.annual_fee !== undefined && card.annual_fee > 0 && '· '}
                            {card.reward_type === 'cashback' ? '💵 Cash Back' :
                             card.reward_type === 'points' ? '✨ Points' :
                             card.reward_type === 'miles' ? '✈️ Miles' : card.reward_type}
                          </span>
                        )}
                        {!card.accepting_applications && (
                          <span className="inline-flex rounded-full bg-gray-100 px-1.5 text-xs font-medium text-gray-600">
                            Archived
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm hidden sm:table-cell">
                  {card.annual_fee !== undefined ? (
                    card.annual_fee === 0 ? <span className="text-gray-500">$0</span> :
                    <span className="text-amber-700 font-medium">${card.annual_fee}</span>
                  ) : '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm hidden sm:table-cell">
                  {card.reward_type ? (
                    <span className="inline-flex items-center gap-1 text-gray-600 text-xs font-medium">
                      <span aria-hidden="true">
                        {card.reward_type === 'cashback' ? '💵' :
                         card.reward_type === 'points' ? '✨' :
                         card.reward_type === 'miles' ? '✈️' : ''}
                      </span>
                      {card.reward_type === 'cashback' ? 'Cash Back' :
                       card.reward_type === 'points' ? 'Points' :
                       card.reward_type === 'miles' ? 'Miles' :
                       card.reward_type}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-4 text-sm hidden lg:table-cell">
                  {(() => {
                    const top = getTopReward(card.rewards);
                    if (!top) return <span className="text-gray-400">—</span>;
                    const rateStr = top.unit === 'percent' ? `${top.value}%` : `${top.value}x`;
                    const label = categoryLabels[top.category] || top.category;
                    const hasBookingRestriction = top.note && /book|portal|through|travel center/i.test(top.note);
                    return (
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400 flex-shrink-0">
                          <CategoryIcon category={top.category} className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <span className="font-semibold text-gray-900">{rateStr}</span>
                          <span className="text-gray-500 ml-1 text-xs">{label}</span>
                          {hasBookingRestriction && (
                            <span className="ml-1 text-[10px] text-gray-500 bg-gray-100 rounded px-1 py-0.5 font-medium whitespace-nowrap" title={top.note || ''}>conditions apply</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </td>
                <td className="px-3 py-4 text-sm hidden lg:table-cell">
                  {(() => {
                    const bonus = card.signup_bonus;
                    if (!bonus || !bonus.value) return <span className="text-gray-400">—</span>;
                    const isCash = bonus.type === 'cash' || bonus.type === 'cashback';
                    const valueStr = isCash
                      ? `$${bonus.value.toLocaleString()}`
                      : bonus.value >= 1000
                        ? `${Math.round(bonus.value / 1000)}K ${bonus.type}`
                        : `${bonus.value.toLocaleString()} ${bonus.type}`;
                    return (
                      <div>
                        <div className="font-semibold text-gray-900">{valueStr}</div>
                        <div className="text-xs text-gray-500">
                          ${bonus.spend_requirement.toLocaleString()} in {bonus.timeframe_months}mo
                        </div>
                      </div>
                    );
                  })()}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-right hidden sm:table-cell">
                  {(() => {
                    const total = (card.approved_count || 0) + (card.rejected_count || 0);
                    if (total === 0) return <span className="text-gray-400">—</span>;
                    const rate = Math.round(((card.approved_count || 0) / total) * 100);
                    return (
                      <div>
                        <span className={rate >= 50 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>{rate}%</span>
                        <span className="text-gray-400 text-xs ml-1">({total})</span>
                      </div>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
