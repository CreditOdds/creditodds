'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card } from "@/lib/api";
import { cardMatchesSearch } from "@/lib/searchAliases";

interface ExploreClientProps {
  cards: Card[];
  banks: string[];
}

type SortOption = 'popular' | 'name' | 'recent' | 'bank';

// Emoji quick filters - maps to card tags
const emojiFilters = [
  { emoji: '✈️', label: 'Travel', tag: 'travel' },
  { emoji: '💰', label: 'Cash Back', tag: 'cashback' },
  { emoji: '🏨', label: 'Hotels', tag: 'hotel' },
  { emoji: '🛒', label: 'Shopping', tag: 'shopping' },
  { emoji: '🎓', label: 'Student', tag: 'student' },
  { emoji: '🔒', label: 'Secured', tag: 'secured' },
  { emoji: '💎', label: 'Premium', tag: 'premium' },
  { emoji: '💼', label: 'Business', tag: 'business' },
  { emoji: '🍽️', label: 'Dining', tag: 'dining' },
  { emoji: '⭐', label: 'Rewards', tag: 'rewards' },
];

export default function ExploreClient({ cards, banks }: ExploreClientProps) {
  const [search, setSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [activeEmoji, setActiveEmoji] = useState<string | null>(null);
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

      // Apply emoji filter if active (filter by tag)
      let matchesEmoji = true;
      if (activeEmoji) {
        const filter = emojiFilters.find(f => f.emoji === activeEmoji);
        if (filter) {
          matchesEmoji = card.tags?.includes(filter.tag) || false;
        }
      }

      // Hide archived cards unless showArchived is true
      const matchesStatus = showArchived || card.accepting_applications;

      // Hide business cards unless showBusiness is true or actively filtering for business
      const isBusiness = card.tags?.includes('business') || card.category === 'business';
      const matchesBusiness = showBusiness || !isBusiness || activeEmoji === '💼';

      return matchesSearch && matchesBank && matchesEmoji && matchesStatus && matchesBusiness;
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
  }, [cards, search, selectedBank, sortBy, activeEmoji, showArchived, showBusiness]);

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
      {/* Recently Released Section */}
      {recentlyReleased.length > 0 && !search && !selectedBank && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Recently Released</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {recentlyReleased.map((card) => (
              <Link
                key={card.card_id}
                href={`/card/${card.slug}`}
                className="flex-shrink-0 bg-white rounded-lg shadow p-2 hover:shadow-md transition-shadow flex items-center gap-2 w-[200px] sm:w-[220px]"
              >
                <div className="h-10 w-16 relative flex-shrink-0">
                  <Image
                    src={card.card_image_link
                      ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                      : '/assets/generic-card.svg'}
                    alt={card.card_name}
                    fill
                    className="object-contain"
                    sizes="64px"
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

      {/* Emoji Quick Filters */}
      <div className="mt-8">
        <div className="flex flex-wrap gap-2">
          {emojiFilters.map((filter) => (
            <button
              key={filter.emoji}
              onClick={() => setActiveEmoji(activeEmoji === filter.emoji ? null : filter.emoji)}
              aria-label={`Filter by ${filter.label} cards`}
              aria-pressed={activeEmoji === filter.emoji}
              className={`inline-flex items-center px-3 py-2 rounded-full text-sm font-medium transition-all ${
                activeEmoji === filter.emoji
                  ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="mr-1.5 text-lg" aria-hidden="true">{filter.emoji}</span>
              {filter.label}
            </button>
          ))}
          {activeEmoji && (
            <button
              onClick={() => setActiveEmoji(null)}
              aria-label="Clear filter"
              className="inline-flex items-center px-3 py-2 rounded-full text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200"
            >
              <span aria-hidden="true">✕</span> Clear
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor="search" className="sr-only">Search cards</label>
          <input
            type="text"
            id="search"
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>
        <div className="sm:w-48">
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
        <div className="sm:w-48">
          <label htmlFor="sort" className="sr-only">Sort by</label>
          <select
            id="sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="popular">Sort by Most Popular</option>
            <option value="name">Sort by Name</option>
            <option value="recent">Sort by Release Date</option>
            <option value="bank">Sort by Bank</option>
          </select>
        </div>
      </div>

      {/* Results count and toggles */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-500">
          Showing {filteredCards.length} of {cards.length} cards
        </p>
        <div className="flex items-center gap-4">
          <label className="flex items-center cursor-pointer">
            <span className="text-sm text-gray-500 mr-2">
              Business ({businessCount})
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={showBusiness}
              onClick={() => setShowBusiness(!showBusiness)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                showBusiness ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  showBusiness ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
          <label className="flex items-center cursor-pointer">
            <span className="text-sm text-gray-500 mr-2">
              Archived ({archivedCount})
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={showArchived}
              onClick={() => setShowArchived(!showArchived)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
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
        </div>
      </div>

      {/* Cards Table */}
      <div className="mt-4 flex flex-col -mx-4 sm:mx-0">
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
                      Approval Rate
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 hidden sm:table-cell">
                      Reward Type
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredCards.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center">
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
                              setActiveEmoji(null);
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
                              <Image
                                src={card.card_image_link
                                  ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                                  : '/assets/generic-card.svg'}
                                alt={card.card_name}
                                width={64}
                                height={40}
                                className="h-8 w-12 sm:h-10 sm:w-16 object-contain"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-indigo-600 group-hover:text-indigo-900 truncate">
                                {card.card_name}
                              </div>
                              <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2">
                                <span>{card.bank}</span>
                                {/* Show fee and status on mobile inline */}
                                <span className="sm:hidden">
                                  {card.annual_fee !== undefined && card.annual_fee > 0 && (
                                    <span className="text-gray-400">· ${card.annual_fee}/yr</span>
                                  )}
                                </span>
                                {!card.accepting_applications && (
                                  <span className="sm:hidden inline-flex rounded-full bg-gray-100 px-1.5 text-xs font-medium text-gray-600">
                                    Archived
                                  </span>
                                )}
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 hidden sm:table-cell">
                          {card.annual_fee !== undefined ? (card.annual_fee === 0 ? '$0' : `$${card.annual_fee}`) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm hidden sm:table-cell">
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
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-right hidden sm:table-cell">
                          {card.reward_type ? (
                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                              card.reward_type === 'cashback' ? 'bg-green-100 text-green-800' :
                              card.reward_type === 'points' ? 'bg-indigo-100 text-indigo-800' :
                              card.reward_type === 'miles' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {card.reward_type === 'cashback' ? 'Cash Back' :
                               card.reward_type === 'points' ? 'Points' :
                               card.reward_type === 'miles' ? 'Miles' :
                               card.reward_type}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
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
