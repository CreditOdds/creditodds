'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card } from '@/lib/api';

interface BankCardsTableProps {
  cards: Card[];
}

export default function BankCardsTable({ cards }: BankCardsTableProps) {
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
        if (a.accepting_applications !== b.accepting_applications) {
          return a.accepting_applications ? -1 : 1;
        }
        return a.card_name.localeCompare(b.card_name);
      });
  }, [cards, showArchived]);

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
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredCards.map((card) => (
              <tr key={card.card_id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6">
                  <Link href={`/card/${card.slug}`} className="flex items-center group">
                    <div className="h-10 w-16 flex-shrink-0 mr-4 hidden sm:block">
                      <Image
                        src={card.card_image_link
                          ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                          : '/assets/generic-card.svg'}
                        alt={card.card_name}
                        width={64}
                        height={40}
                        className="h-10 w-16 object-contain"
                      />
                    </div>
                    <div className="text-sm font-medium text-indigo-600 group-hover:text-indigo-900">
                      {card.card_name}
                    </div>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm">
                  {card.accepting_applications ? (
                    <span className="inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 text-xs font-semibold leading-5 text-gray-800">
                      Archived
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
