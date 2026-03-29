'use client';

import { useState } from 'react';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { CreditCardIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { CardWireEntry } from '@/lib/api';

const PAGE_SIZE = 25;

const fieldLabels: Record<string, string> = {
  annual_fee: 'Annual Fee',
  signup_bonus_value: 'Sign-up Bonus',
  reward_top_rate: 'Top Reward Rate',
  apr_min: 'APR Min',
  apr_max: 'APR Max',
};

function formatValue(field: string, value: string | null): string {
  if (value === null || value === '') return '—';
  const num = parseFloat(value);
  if (isNaN(num)) return value;

  if (field === 'annual_fee') {
    return num === 0 ? '$0' : `$${num.toLocaleString()}`;
  }
  if (field === 'signup_bonus_value') {
    return num.toLocaleString();
  }
  if (field === 'reward_top_rate' || field === 'apr_min' || field === 'apr_max') {
    return `${num}%`;
  }
  return value;
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface Props {
  entries: CardWireEntry[];
  slugMap: Record<string, string>;
}

export default function CardWireTable({ entries, slugMap }: Props) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visible = entries.slice(0, visibleCount);
  const hasMore = visibleCount < entries.length;

  if (entries.length === 0) {
    return (
      <div className="bg-white shadow sm:rounded-lg overflow-hidden">
        <div className="px-6 py-12 text-center text-gray-500">
          No card changes recorded yet. Check back soon!
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow sm:rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
              Date
            </th>
            <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Card
            </th>
            <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
              Feature
            </th>
            <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Change
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {visible.map((entry) => {
            const slug = slugMap[entry.card_name];
            const label = fieldLabels[entry.field] ?? entry.field;
            const oldFmt = formatValue(entry.field, entry.old_value);
            const newFmt = formatValue(entry.field, entry.new_value);

            return (
              <tr key={entry.id} className="hover:bg-gray-50">
                {/* Date */}
                <td className="px-3 sm:px-6 py-2 whitespace-nowrap text-xs text-gray-500">
                  {formatDate(entry.changed_at)}
                </td>

                {/* Card */}
                <td className="px-3 sm:px-6 py-2">
                  {slug ? (
                    <Link
                      href={`/card/${slug}`}
                      className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-900"
                    >
                      {entry.card_image_link ? (
                        <CardImage
                          cardImageLink={entry.card_image_link}
                          alt={entry.card_name}
                          width={40}
                          height={25}
                          className="rounded-sm object-contain flex-shrink-0"
                          sizes="40px"
                        />
                      ) : (
                        <CreditCardIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      )}
                      <span className="whitespace-nowrap">{entry.card_name}</span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-gray-900">
                      {entry.card_image_link ? (
                        <CardImage
                          cardImageLink={entry.card_image_link}
                          alt={entry.card_name}
                          width={40}
                          height={25}
                          className="rounded-sm object-contain flex-shrink-0"
                          sizes="40px"
                        />
                      ) : (
                        <CreditCardIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      )}
                      <span className="whitespace-nowrap">{entry.card_name}</span>
                    </div>
                  )}
                </td>

                {/* Feature (hidden on mobile — shown inline in Change col instead) */}
                <td className="px-3 sm:px-6 py-2 hidden sm:table-cell whitespace-nowrap text-sm text-gray-600">
                  {label}
                </td>

                {/* Change */}
                <td className="px-3 sm:px-6 py-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                    <span className="text-xs text-gray-400 sm:hidden">{label}</span>
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="text-gray-500">{oldFmt}</span>
                      <ArrowRightIcon className="h-3 w-3 text-gray-400 flex-shrink-0" />
                      <span className="font-medium text-gray-900">{newFmt}</span>
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {hasMore && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-center">
          <button
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-300 rounded-md hover:bg-indigo-50 transition-colors"
          >
            Show More ({entries.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
