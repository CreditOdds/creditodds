'use client';

import { useMemo, useState } from 'react';
import { getValuationBySlug } from '@/lib/valuations';

interface RewardValueConverterProps {
  fallbackCpp: number;
  inputLabel: string;
  unitLabel: string;
  valuationSlug: string;
  statementCreditCpp?: number;
}

function formatNumber(value: string): string {
  const num = value.replace(/[^0-9]/g, '');
  if (!num) return '';
  return Number(num).toLocaleString();
}

function parseNumber(formatted: string): number {
  return Number(formatted.replace(/[^0-9]/g, '')) || 0;
}

export default function RewardValueConverter({
  fallbackCpp,
  inputLabel,
  unitLabel,
  valuationSlug,
  statementCreditCpp,
}: RewardValueConverterProps) {
  const [amount, setAmount] = useState('');
  const parsedAmount = parseNumber(amount);
  const centsPerUnit = useMemo(
    () => getValuationBySlug(valuationSlug)?.cpp ?? fallbackCpp,
    [fallbackCpp, valuationSlug]
  );
  const usdValue = parsedAmount * (centsPerUnit / 100);
  const statementCreditValue = statementCreditCpp
    ? parsedAmount * (statementCreditCpp / 100)
    : null;

  return (
    <div className="mt-6 max-w-lg">
      <div className="bg-white rounded-lg shadow p-6">
        <label htmlFor={`${valuationSlug}-amount`} className="block text-sm font-medium text-gray-700">
          {inputLabel}
        </label>
        <div className="mt-1">
          <input
            id={`${valuationSlug}-amount`}
            type="text"
            inputMode="numeric"
            placeholder="10,000"
            value={amount}
            onChange={(event) => setAmount(formatNumber(event.target.value))}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        {parsedAmount > 0 && (
          <div className={`mt-4 ${statementCreditCpp ? 'grid grid-cols-2 gap-3' : ''}`}>
            <div className="p-4 bg-indigo-50 rounded-md">
              <p className="text-sm text-gray-600">{statementCreditCpp ? 'Travel / Transfer' : 'Estimated Value'}</p>
              <p className="text-3xl font-bold text-indigo-600">
                ${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {centsPerUnit}&cent; per {unitLabel}
              </p>
            </div>
            {statementCreditValue !== null && (
              <div className="p-4 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-600">Statement Credit</p>
                <p className="text-3xl font-bold text-gray-600">
                  ${statementCreditValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {statementCreditCpp}&cent; per {unitLabel}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Based on a valuation of {centsPerUnit} cents per {unitLabel}{statementCreditCpp ? ` for travel, ${statementCreditCpp} cents for statement credit` : ''}. Actual redemption value varies by booking.
      </p>
    </div>
  );
}
