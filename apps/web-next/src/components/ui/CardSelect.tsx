'use client';

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Downshift from "downshift";
import Image from "next/image";
import { ClockIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Card } from "@/lib/api";
import { cardMatchesSearch } from "@/lib/searchAliases";

interface CardSelectProps {
  allCards: Card[];
}

// Recent searches storage key (#15)
const RECENT_SEARCHES_KEY = 'creditodds_recent_searches';
const MAX_RECENT_SEARCHES = 5;

export default function CardSelect({ allCards }: CardSelectProps) {
  const router = useRouter();
  const [recentSearches, setRecentSearches] = useState<Card[]>([]);

  // Load recent searches from localStorage (#15)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (saved) {
        const recentNames = JSON.parse(saved) as string[];
        const recentCards = recentNames
          .map(name => allCards.find(c => c.card_name === name))
          .filter((c): c is Card => c !== undefined);
        setRecentSearches(recentCards);
      }
    } catch {
      // Ignore storage errors
    }
  }, [allCards]);

  // Save recent search (#15)
  const saveRecentSearch = useCallback((card: Card) => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      const recent = saved ? JSON.parse(saved) as string[] : [];
      const filtered = recent.filter(name => name !== card.card_name);
      const updated = [card.card_name, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Handle card selection
  const handleSelection = useCallback((selection: Card | null) => {
    if (selection) {
      saveRecentSearch(selection);
      router.push(`/card/${selection.slug}`);
    }
  }, [router, saveRecentSearch]);

  return (
    <Downshift
      id="card-select"
      onChange={handleSelection}
      itemToString={(item) => (item ? item.card_name : "")}
    >
      {({
        getInputProps,
        getItemProps,
        getLabelProps,
        getMenuProps,
        isOpen,
        inputValue,
        highlightedIndex,
        selectedItem,
        getRootProps,
      }) => {
        // Filter cards based on input (with alias support), then sort with archived cards at the bottom
        const filteredCards = allCards
          .filter(
            (item) => cardMatchesSearch(item.card_name, item.bank, inputValue || '')
          )
          .sort((a, b) => {
            // Active cards first, archived cards last
            if (a.accepting_applications !== b.accepting_applications) {
              return a.accepting_applications ? -1 : 1;
            }
            return 0; // Preserve original order within each group
          });

        // Show recent searches when input is empty, otherwise show filtered results
        const showRecent = isOpen && !inputValue && recentSearches.length > 0;
        const displayCards = showRecent ? recentSearches : filteredCards;

        return (
          <div className="mt-1 relative">
            <label htmlFor="search" className="sr-only" {...getLabelProps()}>
              Select a Credit Card
            </label>
            <div {...getRootProps({}, { suppressRefError: true })}>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  {...getInputProps()}
                  id="search"
                  name="search"
                  className="shadow-sm text-base sm:text-xl border focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 pr-3 border-gray-300 rounded-md h-12"
                  placeholder="Search cards..."
                  type="search"
                  autoComplete="off"
                />
              </div>
              <ul
                {...getMenuProps()}
                className={`absolute z-20 mt-1 w-full bg-white shadow-lg max-h-80 rounded-lg py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm ${
                  isOpen && displayCards.length > 0 ? '' : 'hidden'
                }`}
                tabIndex={-1}
                role="listbox"
                aria-labelledby="listbox-label"
              >
                {/* Recent searches header */}
                {showRecent && (
                  <li className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                    <ClockIcon className="h-4 w-4 inline mr-1" />
                    Recent Searches
                  </li>
                )}

                {/* Results count for filtered results */}
                {isOpen && inputValue && (
                  <li className="px-3 py-2 text-xs text-gray-500 bg-gray-50">
                    {filteredCards.length} card{filteredCards.length !== 1 ? 's' : ''} found
                  </li>
                )}

                {displayCards.map((item, index) => {
                  const isArchived = !item.accepting_applications;
                  return (
                    <li
                      key={item.card_name}
                      className={`cursor-pointer select-none relative py-3 pl-3 pr-9 ${
                        highlightedIndex === index
                          ? 'bg-indigo-50 text-indigo-900'
                          : isArchived
                          ? 'text-gray-400 bg-gray-50'
                          : 'text-gray-900'
                      }`}
                      {...getItemProps({
                        index,
                        item,
                      })}
                    >
                      <div className={`flex items-center ${isArchived ? 'opacity-60' : ''}`}>
                        <div className={`flex-shrink-0 h-8 w-12 relative ${isArchived ? 'grayscale' : ''}`}>
                          <Image
                            src={item.card_image_link
                              ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${item.card_image_link}`
                              : '/assets/generic-card.svg'
                            }
                            alt=""
                            fill
                            className="object-contain"
                            sizes="48px"
                          />
                        </div>
                        <div className="ml-3 flex-1 min-w-0">
                          <p className={`text-sm truncate ${
                            selectedItem === item ? 'font-semibold' : 'font-normal'
                          }`}>
                            {item.card_name}
                          </p>
                          <p className={`text-xs truncate ${isArchived ? 'text-gray-400' : 'text-gray-500'}`}>
                            {item.bank}
                            {isArchived && <span className="ml-1">(Archived)</span>}
                          </p>
                        </div>
                        {item.approved_count !== undefined && item.approved_count > 0 && (
                          <span className="ml-2 text-xs text-gray-400">
                            {item.approved_count + (item.rejected_count || 0)} records
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}

                {/* No results message */}
                {isOpen && inputValue && filteredCards.length === 0 && (
                  <li className="px-3 py-4 text-sm text-gray-500 text-center">
                    No cards found matching &quot;{inputValue}&quot;
                  </li>
                )}
              </ul>
            </div>
          </div>
        );
      }}
    </Downshift>
  );
}
