'use client';

import { useState } from 'react';
import { getValuationBySlug } from '@/lib/valuations';

const CENTS_PER_POINT = getValuationBySlug('marriott-bonvoy')?.cpp ?? 0.7;
const RATE = CENTS_PER_POINT / 100;

function formatNumber(value: string): string {
  const num = value.replace(/[^0-9]/g, '');
  if (!num) return '';
  return Number(num).toLocaleString();
}

function parseNumber(formatted: string): number {
  return Number(formatted.replace(/[^0-9]/g, '')) || 0;
}

export default function ConverterClient() {
  const [points, setPoints] = useState('');

  const pointsValue = parseNumber(points);
  const usdValue = pointsValue * RATE;

  return (
    <div className="mt-6 max-w-lg">
      <div className="bg-white rounded-lg shadow p-6">
        <label htmlFor="points" className="block text-sm font-medium text-gray-700">
          Marriott Bonvoy Points
        </label>
        <div className="mt-1">
          <input
            id="points"
            type="text"
            inputMode="numeric"
            placeholder="10,000"
            value={points}
            onChange={(e) => setPoints(formatNumber(e.target.value))}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        {pointsValue > 0 && (
          <div className="mt-4 p-4 bg-indigo-50 rounded-md">
            <p className="text-sm text-gray-600">Estimated Value</p>
            <p className="text-3xl font-bold text-indigo-600">
              ${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {formatNumber(String(pointsValue))} points &times; {CENTS_PER_POINT}&cent; per point
            </p>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Based on a valuation of {CENTS_PER_POINT} cents per point. Actual redemption value varies by booking.
      </p>
    </div>
  );
}
