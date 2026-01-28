'use client';

import Image from 'next/image';
import { RecentRecord } from '@/lib/api';

interface RecordsTickerProps {
  records: RecentRecord[];
}

export default function RecordsTicker({ records }: RecordsTickerProps) {
  if (records.length === 0) return null;

  // Duplicate records to create seamless loop
  const duplicatedRecords = [...records, ...records];

  return (
    <div className="hidden lg:block bg-indigo-900 overflow-hidden">
      <div className="relative flex">
        <div className="animate-ticker flex whitespace-nowrap">
          {duplicatedRecords.map((record, index) => (
            <div
              key={`${record.record_id}-${index}`}
              className="inline-flex items-center px-6 py-2 border-r border-indigo-700"
            >
              {/* Card Image */}
              <div className="h-8 w-12 flex-shrink-0 relative mr-3">
                <Image
                  src={record.card_image_link
                    ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${record.card_image_link}`
                    : '/assets/generic-card.svg'}
                  alt={record.card_name}
                  fill
                  className="object-contain"
                  sizes="48px"
                />
              </div>

              {/* Card Info */}
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium text-white">{record.card_name}</span>
                <span className="text-indigo-200">
                  {record.credit_score} score
                </span>
                <span className="text-indigo-200">
                  ${record.listed_income?.toLocaleString()} income
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  record.result === 1
                    ? 'bg-green-500/20 text-green-300'
                    : 'bg-red-500/20 text-red-300'
                }`}>
                  {record.result === 1 ? 'Approved' : 'Denied'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
