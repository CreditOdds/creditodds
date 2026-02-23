'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { XMarkIcon, TrashIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { addToWallet, removeFromWallet, WalletCard } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';

interface EditWalletCardModalProps {
  show: boolean;
  card: WalletCard | null;
  cardSlug?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const months = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export default function EditWalletCardModal({ show, card, cardSlug, onClose, onSuccess }: EditWalletCardModalProps) {
  const { getToken } = useAuth();
  const [acquiredMonth, setAcquiredMonth] = useState<number | undefined>();
  const [acquiredYear, setAcquiredYear] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate year options (current year back to 1990)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1989 }, (_, i) => currentYear - i);

  // Reset form when card changes
  useEffect(() => {
    if (card) {
      setAcquiredMonth(card.acquired_month);
      setAcquiredYear(card.acquired_year);
      setError(null);
    }
  }, [card]);

  const handleSave = async () => {
    if (!card) return;

    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      await addToWallet(
        card.card_id,
        acquiredMonth,
        acquiredYear,
        token || undefined
      );
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update card');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!card) return;
    if (!confirm(`Remove "${card.card_name}" from your wallet?`)) return;

    setDeleting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');
      await removeFromWallet(card.card_id, token);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove card');
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  if (!show || !card) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleClose} />

        {/* Modal */}
        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md">
          <div className="bg-white px-4 pb-4 pt-5 sm:p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Card</h3>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Card Info */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <div className="h-12 w-20 flex-shrink-0 mr-4">
                  <Image
                    src={card.card_image_link
                      ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                      : '/assets/generic-card.svg'}
                    alt={card.card_name}
                    width={80}
                    height={48}
                    className="h-12 w-20 object-contain"
                  />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{card.card_name}</div>
                  <div className="text-sm text-gray-500">{card.bank}</div>
                  {(card.acquired_month || card.acquired_year) && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Since {card.acquired_month ? new Date(2000, card.acquired_month - 1).toLocaleString('default', { month: 'short' }) + ' ' : ''}{card.acquired_year || ''}
                    </div>
                  )}
                </div>
              </div>
              {cardSlug && (
                <Link
                  href={`/card/${cardSlug}`}
                  className="mt-3 inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  View card details
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </Link>
              )}
            </div>

            {/* Acquired Date */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When did you get this card?
              </label>
              <div className="grid grid-cols-2 gap-4">
                <select
                  value={acquiredMonth || ''}
                  onChange={(e) => setAcquiredMonth(e.target.value ? Number(e.target.value) : undefined)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value="">Month</option>
                  {months.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select
                  value={acquiredYear || ''}
                  onChange={(e) => setAcquiredYear(e.target.value ? Number(e.target.value) : undefined)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value="">Year</option>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={handleDelete}
                disabled={deleting || saving}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
                {deleting ? 'Removing...' : 'Remove from Wallet'}
              </button>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || deleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
