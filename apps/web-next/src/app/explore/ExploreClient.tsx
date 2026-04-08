'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import CardImage from "@/components/ui/CardImage";
import { Card, Reward } from "@/lib/api";
import { cardMatchesSearch } from "@/lib/searchAliases";
import { categoryLabels, CategoryIcon } from "@/lib/cardDisplayUtils";

interface ExploreClientProps {
  cards: Card[];
  banks: string[];
  trendingViews?: Record<number, number>;
  allTimeViews?: Record<number, number>;
}

type SortOption = 'popular' | 'trending' | 'all-time-views' | 'name' | 'recent' | 'bank';

function getTopReward(rewards: Reward[] | undefined): Reward | null {
  if (!rewards || rewards.length === 0) return null;
  // Prefer the best non-base category, but fall back to everything_else for flat-rate cards
  const sorted = [...rewards].sort((a, b) => b.value - a.value);
  const best = sorted.find(r => r.category !== 'everything_else');
  return best || sorted[0];
}

export default function ExploreClient({ cards, banks, trendingViews, allTimeViews }: ExploreClientProps) {
  const [search, setSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortOption>('trending');
  const [showArchived, setShowArchived] = useState(false);
  const [showBusiness, setShowBusiness] = useState(false);

  // Get recently released cards (cards with release_date, sorted by most recent)
  const recentlyReleased = useMemo(() => {
    return cards
      .filter(card => card.release_date && card.accepting_applications)
      .sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
      .slice(0, 5);
  }, [cards]);

  const filteredCards = useMemo(() => {
    let filtered = cards.filter(card => {
      const matchesSearch = cardMatchesSearch(card.card_name, card.bank, search);
      const matchesBank = selectedBank === "" || card.bank === selectedBank;
      const matchesStatus = showArchived || card.accepting_applications;
      const isBusiness = card.tags?.includes('business') || card.category === 'business';
      const matchesBusiness = showBusiness || !isBusiness;

      return matchesSearch && matchesBank && matchesStatus && matchesBusiness;
    });

    // Sort based on selected option
    switch (sortBy) {
      case 'popular':
        filtered = [...filtered].sort((a, b) => {
          const aRecords = (a.approved_count || 0) + (a.rejected_count || 0);
          const bRecords = (b.approved_count || 0) + (b.rejected_count || 0);
          if (aRecords !== bRecords) return bRecords - aRecords;
          return a.card_name.localeCompare(b.card_name);
        });
        break;
      case 'trending':
        filtered = [...filtered].sort((a, b) => {
          const aViews = trendingViews?.[Number(a.db_card_id || a.card_id)] || 0;
          const bViews = trendingViews?.[Number(b.db_card_id || b.card_id)] || 0;
          if (aViews !== bViews) return bViews - aViews;
          return a.card_name.localeCompare(b.card_name);
        });
        break;
      case 'all-time-views':
        filtered = [...filtered].sort((a, b) => {
          const aViews = allTimeViews?.[Number(a.db_card_id || a.card_id)] || 0;
          const bViews = allTimeViews?.[Number(b.db_card_id || b.card_id)] || 0;
          if (aViews !== bViews) return bViews - aViews;
          return a.card_name.localeCompare(b.card_name);
        });
        break;
      case 'recent':
        filtered = [...filtered].sort((a, b) => {
          // Cards with release_date come first, sorted by most recent
          if (a.release_date && b.release_date) {
            return b.release_date.localeCompare(a.release_date);
          }
          if (a.release_date) return -1;
          if (b.release_date) return 1;
          return a.card_name.localeCompare(b.card_name);
        });
        break;
      case 'bank':
        filtered = [...filtered].sort((a, b) => a.bank.localeCompare(b.bank));
        break;
      case 'name':
      default:
        filtered = [...filtered].sort((a, b) => a.card_name.localeCompare(b.card_name));
    }

    return filtered;
  }, [cards, search, selectedBank, sortBy, showArchived, showBusiness, trendingViews, allTimeViews]);

  // Count archived cards
  const archivedCount = useMemo(() => {
    return cards.filter(card => !card.accepting_applications).length;
  }, [cards]);

  // Count business cards
  const businessCount = useMemo(() => {
    return cards.filter(card => card.tags?.includes('business') || card.category === 'business').length;
  }, [cards]);

  return (
    <>
      {/* Recently Released */}
      {recentlyReleased.length > 0 && !search && !selectedBank && (
        <div className="mt-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">New Arrivals</h2>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {recentlyReleased.map((card) => (
              <Link
                key={card.card_id}
                href={`/card/${card.slug}`}
                className="flex-shrink-0 bg-white rounded-lg border border-gray-200 px-3 py-2 hover:border-indigo-300 hover:shadow-sm transition-all flex items-center gap-2.5 w-[200px]"
              >
                <div className="h-8 w-12 relative flex-shrink-0">
                  <CardImage
                    cardImageLink={card.card_image_link}
                    alt={card.card_name}
                    fill
                    className="object-contain"
                    sizes="48px"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{card.card_name}</p>
                  <p className="text-[10px] text-gray-500 truncate">{card.bank}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Filters — single row */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 relative">
          <label htmlFor="search" className="sr-only">Search cards</label>
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input
            type="text"
            id="search"
            placeholder="Search cards or banks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-md border-gray-300 pl-9 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-full sm:w-40">
            <label htmlFor="bank" className="sr-only">Filter by bank</label>
            <select
              id="bank"
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="">All Banks</option>
              {banks.map(bank => (
                <option key={bank} value={bank}>{bank}</option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-44">
            <label htmlFor="sort" className="sr-only">Sort by</label>
            <select
              id="sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="popular">Most Popular</option>
              <option value="trending">Trending (30 days)</option>
              <option value="all-time-views">Most Viewed</option>
              <option value="name">Name</option>
              <option value="recent">Release Date</option>
              <option value="bank">Bank</option>
            </select>
          </div>
          <button
            onClick={() => setShowBusiness(!showBusiness)}
            className={`hidden sm:inline-flex whitespace-nowrap px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              showBusiness
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Business
          </button>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`hidden sm:inline-flex whitespace-nowrap px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              showArchived
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Archived
          </button>
        </div>
        {/* Mobile toggles */}
        <div className="flex gap-2 sm:hidden">
          <button
            onClick={() => setShowBusiness(!showBusiness)}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              showBusiness
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Business ({businessCount})
          </button>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              showArchived
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Archived ({archivedCount})
          </button>
        </div>
      </div>

      {/* Cards Table */}
      <div className="mt-4 flex flex-col -mx-4 sm:mx-0 overflow-hidden">
        <div className="-my-2 sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
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
                  {filteredCards.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <div className="text-gray-500">
                          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                          </svg>
                          <h3 className="mt-2 text-sm font-semibold text-gray-900">No cards found</h3>
                          <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filters to find what you&apos;re looking for.</p>
                          <button
                            onClick={() => {
                              setSearch('');
                              setSelectedBank('');
                              setShowArchived(false);
                              setShowBusiness(false);
                            }}
                            className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-500"
                          >
                            Clear all filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredCards.map((card) => (
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
                              <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2">
                                <span>{card.bank}</span>
                                {/* Show fee, reward type, and SUB on mobile inline */}
                                <span className="sm:hidden">
                                  {card.annual_fee !== undefined && card.annual_fee > 0 && (
                                    <span className="text-amber-600 font-medium">· ${card.annual_fee}/yr</span>
                                  )}
                                </span>
                                {card.reward_type && (
                                  <span className="sm:hidden">
                                    · {card.reward_type === 'cashback' ? '💵 Cash Back' :
                                       card.reward_type === 'points' ? '✨ Points' :
                                       card.reward_type === 'miles' ? '✈️ Miles' : card.reward_type}
                                  </span>
                                )}
                                {!card.accepting_applications && (
                                  <span className="sm:hidden inline-flex rounded-full bg-gray-100 px-1.5 text-xs font-medium text-gray-600">
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
                              : bonus.type === 'free_nights'
                                ? `${bonus.value} Free Night Award${bonus.value !== 1 ? 's' : ''}`
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
