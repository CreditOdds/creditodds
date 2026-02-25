'use client';

import { useState } from 'react';

const CENTS_PER_MILE = 1.2;
const RATE = CENTS_PER_MILE / 100; // 0.012

function formatNumber(value: string): string {
  const num = value.replace(/[^0-9]/g, '');
  if (!num) return '';
  return Number(num).toLocaleString();
}

function parseNumber(formatted: string): number {
  return Number(formatted.replace(/[^0-9]/g, '')) || 0;
}

export default function ConverterClient() {
  const [miles, setMiles] = useState('');

  const milesValue = parseNumber(miles);
  const usdValue = milesValue * RATE;

  return (
    <div className="mt-6 max-w-lg">
      <div className="bg-white rounded-lg shadow p-6">
        <label htmlFor="miles" className="block text-sm font-medium text-gray-700">
          United MileagePlus Miles
        </label>
        <div className="mt-1">
          <input
            id="miles"
            type="text"
            inputMode="numeric"
            placeholder="10,000"
            value={miles}
            onChange={(e) => setMiles(formatNumber(e.target.value))}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        {milesValue > 0 && (
          <div className="mt-4 p-4 bg-indigo-50 rounded-md">
            <p className="text-sm text-gray-600">Estimated Value</p>
            <p className="text-3xl font-bold text-indigo-600">
              ${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {formatNumber(String(milesValue))} miles &times; {CENTS_PER_MILE}&cent; per mile
            </p>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Based on a valuation of {CENTS_PER_MILE} cents per mile. Actual redemption value varies by booking.
      </p>
    </div>
  );
}
