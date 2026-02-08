'use client';

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BuildingLibraryIcon, CreditCardIcon } from "@heroicons/react/24/outline";
import { NewsItem, tagLabels, tagColors, NewsTag } from "@/lib/news";
import { ExpandableText } from "@/components/ui/ExpandableText";

const PAGE_SIZE = 15;

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function TagBadge({ tag }: { tag: NewsTag }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${tagColors[tag]}`}>
      {tagLabels[tag]}
    </span>
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
            <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Update
            </th>
            <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
              Bank / Card
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
              Tags
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {visibleItems.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-3 sm:px-6 py-3 sm:py-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  {item.card_image_link && (
                    <Link href={`/card/${item.card_slug}`} className="flex-shrink-0 sm:hidden">
                      <Image
                        src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${item.card_image_link}`}
                        alt={item.card_name || ''}
                        width={40}
                        height={25}
                        className="rounded-sm object-contain"
                        sizes="40px"
                      />
                    </Link>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <span>{formatDate(item.date)}</span>
                      {item.bank && (
                        <span className="sm:hidden text-gray-400">· {item.bank}</span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-gray-900">
                      {item.title}
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
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                <div className="flex flex-col gap-1">
                  {item.bank && (
                    <div className="flex items-center text-sm text-gray-600">
                      <BuildingLibraryIcon className="h-4 w-4 mr-1 text-gray-400" />
                      {item.bank}
                    </div>
                  )}
                  {item.card_slug && item.card_name && (
                    <Link
                      href={`/card/${item.card_slug}`}
                      className="flex items-center text-sm text-indigo-600 hover:text-indigo-900"
                    >
                      {item.card_image_link ? (
                        <Image
                          src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${item.card_image_link}`}
                          alt={item.card_name}
                          width={32}
                          height={20}
                          className="mr-1.5 rounded-sm object-contain"
                          sizes="40px"
                        />
                      ) : (
                        <CreditCardIcon className="h-4 w-4 mr-1" />
                      )}
                      {item.card_name}
                    </Link>
                  )}
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
