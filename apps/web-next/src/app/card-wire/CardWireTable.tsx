'use client';

import { useState } from 'react';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { CreditCardIcon, ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { CardWireEntry } from '@/lib/api';

const PAGE_SIZE = 50;

const fieldLabels: Record<string, string> = {
  annual_fee: 'Annual Fee',
  signup_bonus_value: 'Sign-up Bonus',
  reward_top_rate: 'Top Reward Rate',
  apr_min: 'APR Min',
  apr_max: 'APR Max',
};

const chipColors: Record<string, { bg: string; text: string }> = {
  annual_fee: { bg: 'bg-amber-100', text: 'text-amber-800' },
  signup_bonus_value: { bg: 'bg-blue-100', text: 'text-blue-800' },
  reward_top_rate: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  apr_min: { bg: 'bg-purple-100', text: 'text-purple-800' },
  apr_max: { bg: 'bg-purple-100', text: 'text-purple-800' },
};

// Fields where an increase is BAD for the consumer
const higherIsBad = new Set(['annual_fee', 'apr_min', 'apr_max']);

function formatValue(field: string, value: string | null, bonusType?: string): string {
  if (value === null || value === '') return '—';
  const num = parseFloat(value);

  if (field === 'annual_fee') {
    if (!isNaN(num)) return num === 0 ? '$0' : `$${num.toLocaleString()}`;
    return value;
  }
  if (field === 'signup_bonus_value') {
    if (!isNaN(num)) {
      const suffix = bonusType ? ` ${bonusType}` : '';
      return `${num.toLocaleString()}${suffix}`;
    }
    // Non-numeric SUB like "5 Free Night Awards"
    return value;
  }
  if (field === 'reward_top_rate' || field === 'apr_min' || field === 'apr_max') {
    if (!isNaN(num)) return `${num}%`;
    return value;
  }
  return value;
}

function getChangeDirection(field: string, oldValue: string | null, newValue: string | null): 'positive' | 'negative' | 'neutral' {
  if (oldValue === null || newValue === null) return 'neutral';
  const oldNum = parseFloat(oldValue);
  const newNum = parseFloat(newValue);
  if (isNaN(oldNum) || isNaN(newNum)) return 'neutral';
  if (oldNum === newNum) return 'neutral';

  const increased = newNum > oldNum;
  if (higherIsBad.has(field)) {
    return increased ? 'negative' : 'positive';
  }
  return increased ? 'positive' : 'negative';
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
  bonusTypeMap: Record<string, string>;
}

export default function CardWireTable({ entries, slugMap, bonusTypeMap }: Props) {
  const [page, setPage] = useState(1);

  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const visible = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function goToPage(p: number) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (entries.length === 0) {
    return (
      <div className="bg-white shadow sm:rounded-lg overflow-hidden">
        <div className="px-6 py-12 text-center text-gray-500">
          No card changes recorded yet. Check back soon!
        </div>
      </div>
    );
  }

  function renderEntry(entry: CardWireEntry) {
    const slug = slugMap[entry.card_name];
    const label = fieldLabels[entry.field] ?? entry.field;
    const chip = chipColors[entry.field] ?? { bg: 'bg-gray-100', text: 'text-gray-700' };
    const bonusType = bonusTypeMap[entry.card_name] || '';
    const oldFmt = formatValue(entry.field, entry.old_value, bonusType);
    const newFmt = formatValue(entry.field, entry.new_value, bonusType);
    const direction = getChangeDirection(entry.field, entry.old_value, entry.new_value);

    const newValueColor =
      direction === 'positive'
        ? 'text-green-600'
        : direction === 'negative'
          ? 'text-red-600'
          : 'text-gray-900';

    return { slug, label, chip, oldFmt, newFmt, newValueColor };
  }

  const pagination = totalPages > 1 && (
    <div className="px-4 sm:px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
      <button
        onClick={() => goToPage(page - 1)}
        disabled={page === 1}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Previous</span>
      </button>
      <span className="text-sm text-gray-600">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => goToPage(page + 1)}
        disabled={page === totalPages}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile: card list grouped by date */}
      <div className="sm:hidden bg-white shadow rounded-lg overflow-hidden">
        {(() => {
          const groups: { date: string; entries: CardWireEntry[] }[] = [];
          for (const entry of visible) {
            const date = formatDate(entry.changed_at);
            const last = groups[groups.length - 1];
            if (last && last.date === date) {
              last.entries.push(entry);
            } else {
              groups.push({ date, entries: [entry] });
            }
          }
          return groups.map((group) => (
            <div key={group.date}>
              <div className="px-4 py-2 bg-gray-100 border-y border-gray-200">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{group.date}</span>
              </div>
              <div className="divide-y divide-gray-200">
                {group.entries.map((entry) => {
                  const { slug, label, chip, oldFmt, newFmt, newValueColor } = renderEntry(entry);
                  const cardContent = (
                    <div className="flex items-center gap-2">
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
                      <span className="font-medium text-sm">{entry.card_name}</span>
                    </div>
                  );

                  return (
                    <div key={entry.id} className="px-4 py-3 space-y-1.5">
                      {slug ? (
                        <Link href={`/card/${slug}`} className="text-indigo-600 hover:text-indigo-900">
                          {cardContent}
                        </Link>
                      ) : (
                        <div className="text-gray-900">{cardContent}</div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${chip.bg} ${chip.text}`}>
                          {label}
                        </span>
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="text-gray-500">{oldFmt}</span>
                          <ArrowRightIcon className="h-3 w-3 text-gray-400 flex-shrink-0" />
                          <span className={`font-medium ${newValueColor}`}>{newFmt}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ));
        })()}
        {pagination}
      </div>

      {/* Desktop: table grouped by date */}
      <div className="hidden sm:block bg-white shadow sm:rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Card
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Feature
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Change
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {(() => {
              const groups: { date: string; entries: CardWireEntry[] }[] = [];
              for (const entry of visible) {
                const date = formatDate(entry.changed_at);
                const last = groups[groups.length - 1];
                if (last && last.date === date) {
                  last.entries.push(entry);
                } else {
                  groups.push({ date, entries: [entry] });
                }
              }
              return groups.map((group) => (
                <>
                  <tr key={`date-${group.date}`} className="bg-gray-100">
                    <td colSpan={3} className="px-6 py-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{group.date}</span>
                    </td>
                  </tr>
                  {group.entries.map((entry) => {
                    const { slug, label, chip, oldFmt, newFmt, newValueColor } = renderEntry(entry);
                    return (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-6 py-2">
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
                        <td className="px-6 py-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${chip.bg} ${chip.text}`}>
                            {label}
                          </span>
                        </td>
                        <td className="px-6 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">{oldFmt}</span>
                            <ArrowRightIcon className="h-3 w-3 text-gray-400 flex-shrink-0" />
                            <span className={`text-sm font-medium ${newValueColor}`}>{newFmt}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </>
              ));
            })()}
          </tbody>
        </table>
        {pagination}
      </div>
    </>
  );
}
