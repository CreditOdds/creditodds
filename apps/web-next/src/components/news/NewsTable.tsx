'use client';

import { useState } from "react";
import Link from "next/link";
import CardImage from "@/components/ui/CardImage";
import { BuildingLibraryIcon, CreditCardIcon } from "@heroicons/react/24/outline";
import { getNewsCards, NewsItem, tagLabels, tagColors, NewsTag } from "@/lib/news";
import { ExpandableText } from "@/components/ui/ExpandableText";

const PAGE_SIZE = 15;

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  // timeZone: 'UTC' keeps SSR and client output identical — date-only strings
  // parse as UTC midnight, so local-zone formatting shifts the day for
  // visitors west of UTC and breaks hydration.
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function TagBadge({ tag }: { tag: NewsTag }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${tagColors[tag]}`}>
      {tagLabels[tag]}
    </span>
  );
}

function CardStack({ item }: { item: NewsItem }) {
  const cards = getNewsCards(item);

  // Single card — simple link with image + name
  if (cards.length <= 1) {
    return cards[0] ? (
      <Link
        href={`/card/${cards[0].slug}`}
        className="flex items-center text-sm text-indigo-600 hover:text-indigo-900 whitespace-nowrap"
      >
        {cards[0].image ? (
          <CardImage
            cardImageLink={cards[0].image}
            alt={cards[0].name}
            width={32}
            height={20}
            className="mr-1.5 rounded-sm object-contain"
            sizes="40px"
          />
        ) : (
          <CreditCardIcon className="h-4 w-4 mr-1" />
        )}
        {cards[0].name}
      </Link>
    ) : null;
  }

  // Multi-card — overlapping stack with hover tooltips
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center">
        <div className="flex -space-x-3">
          {cards.map((card, i) => (
            <Link
              key={card.slug}
              href={`/card/${card.slug}`}
              className="relative group block rounded-sm hover:z-20 transition-transform hover:scale-110"
              style={{ zIndex: cards.length - i }}
            >
              {card.image ? (
                <CardImage
                  cardImageLink={card.image}
                  alt={card.name}
                  width={36}
                  height={23}
                  className="rounded-sm object-contain ring-1 ring-white"
                  sizes="36px"
                />
              ) : (
                <span className="flex items-center justify-center w-9 h-[23px] bg-gray-100 rounded-sm ring-1 ring-white">
                  <CreditCardIcon className="h-3.5 w-3.5 text-gray-400" />
                </span>
              )}
              {/* Tooltip */}
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-800 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-30">
                {card.name}
              </span>
            </Link>
          ))}
        </div>
        <span className="ml-2 text-xs text-gray-500">{cards.length} cards</span>
      </div>
    </div>
  );
}

// Mobile row thumbnail: a purely decorative stack, so cards whose art did not
// resolve are left out rather than shown as an empty tile.
function MobileCardStack({ item }: { item: NewsItem }) {
  const withImages = getNewsCards(item).filter((card) => card.image);
  if (withImages.length === 0) return null;

  return (
    <div className="flex-shrink-0 sm:hidden flex -space-x-2">
      {withImages.slice(0, 3).map((card, i) => (
        <Link
          key={card.slug}
          href={`/card/${card.slug}`}
          style={{ zIndex: withImages.length - i }}
        >
          <CardImage
            cardImageLink={card.image!}
            alt={card.name}
            width={36}
            height={23}
            className="rounded-sm object-contain ring-1 ring-white"
            sizes="36px"
          />
        </Link>
      ))}
      {withImages.length > 3 && (
        <span className="flex items-center justify-center w-9 h-[23px] bg-gray-100 rounded-sm ring-1 ring-white text-[10px] text-gray-500 font-medium"
          style={{ zIndex: 0 }}
        >
          +{withImages.length - 3}
        </span>
      )}
    </div>
  );
}

export default function NewsTable({ newsItems }: { newsItems: NewsItem[] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleItems = newsItems.slice(0, visibleCount);
  const hasMore = visibleCount < newsItems.length;

  if (newsItems.length === 0) {
    return (
      <div className="bg-white shadow sm:rounded-lg overflow-hidden">
        <div className="px-6 py-12 text-center text-gray-500">
          No news updates available yet. Check back soon!
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow sm:rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-semibold text-gray-500">
              Update
            </th>
            <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-semibold text-gray-500 hidden sm:table-cell whitespace-nowrap" style={{ minWidth: '18rem' }}>
              Bank / Card
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">
              Tags
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {visibleItems.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-3 sm:px-6 py-3 sm:py-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <span>{formatDate(item.date)}</span>
                      {item.bank && (
                        <span className="sm:hidden text-gray-400">· {item.bank}</span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-gray-900">
                      {item.body ? (
                        <Link href={`/news/${item.id}`} className="hover:text-indigo-600 transition-colors">
                          {item.title}
                        </Link>
                      ) : (
                        item.title
                      )}
                    </div>
                    <ExpandableText
                      text={item.summary}
                      className="text-sm text-gray-500 mt-1"
                    />
                    <div className="flex flex-wrap gap-1 mt-2 md:hidden">
                      {item.tags.map((tag) => (
                        <TagBadge key={tag} tag={tag} />
                      ))}
                    </div>
                  </div>
                  <MobileCardStack item={item} />
                </div>
              </td>
              <td className="px-6 py-4 hidden sm:table-cell">
                <div className="flex flex-col gap-1">
                  {item.bank && (
                    <div className="flex items-center text-sm text-gray-600">
                      <BuildingLibraryIcon className="h-4 w-4 mr-1 text-gray-400" />
                      {item.bank}
                    </div>
                  )}
                  <CardStack item={item} />
                </div>
              </td>
              <td className="px-6 py-4 hidden md:table-cell">
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <TagBadge key={tag} tag={tag} />
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-center">
          <button
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-300 rounded-md hover:bg-indigo-50 transition-colors"
          >
            Show More ({newsItems.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
