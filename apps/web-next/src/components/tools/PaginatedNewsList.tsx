'use client';

import { useState } from 'react';
import Link from 'next/link';

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  date: string;
  body?: string;
}

const PAGE_SIZE = 5;

export default function PaginatedNewsList({
  news,
  heading,
}: {
  news: NewsItem[];
  heading: string;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const hasMore = visible < news.length;

  if (news.length === 0) return null;

  return (
    <div className="mt-12">
      <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
      <div className="mt-4 space-y-3">
        {news.slice(0, visible).map(item => (
          <div key={item.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-gray-500">
                  {new Date(item.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {item.body ? (
                    <Link href={`/news/${item.id}`} className="hover:text-indigo-600 transition-colors">
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </p>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.summary}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setVisible(v => v + PAGE_SIZE)}
          className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          Show more ({news.length - visible} remaining)
        </button>
      )}
    </div>
  );
}
