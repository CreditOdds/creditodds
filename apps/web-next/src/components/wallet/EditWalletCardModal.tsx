'use client';

import { useState, useEffect } from 'react';
import CardImage from '@/components/ui/CardImage';
import Link from 'next/link';
import { XMarkIcon, TrashIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { addToWallet, removeFromWallet, WalletCard, getCardRatings, getUserCardRating, submitCardRating } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';

interface EditWalletCardModalProps {
  show: boolean;
  card: WalletCard | null;
  cardSlug?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Very Bad',
  2: 'Bad',
  3: 'Average',
  4: 'Good',
  5: 'Very Good',
};

const RATING_COLORS: Record<number, { bg: string; text: string; fill: string }> = {
  1: { bg: 'bg-red-100', text: 'text-red-700', fill: 'text-red-400' },
  2: { bg: 'bg-orange-100', text: 'text-orange-700', fill: 'text-orange-400' },
  3: { bg: 'bg-yellow-100', text: 'text-yellow-700', fill: 'text-yellow-400' },
  4: { bg: 'bg-green-100', text: 'text-green-700', fill: 'text-green-400' },
  5: { bg: 'bg-emerald-100', text: 'text-emerald-700', fill: 'text-emerald-500' },
};

function StarIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? "0" : "1.5"} xmlns="http://www.w3.org/2000/svg">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
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
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  // Generate year options (current year back to 1990)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1989 }, (_, i) => currentYear - i);

  // Reset form when card changes
  useEffect(() => {
    if (card) {
      setAcquiredMonth(card.acquired_month);
      setAcquiredYear(card.acquired_year);
      setError(null);
      setUserRating(null);
      // Load user's rating
      (async () => {
        const token = await getToken();
        if (!token) return;
        const rating = await getUserCardRating(card.card_name, token);
        setUserRating(rating);
      })();
    }
  }, [card, getToken]);

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

  const handleRate = async (rating: number) => {
    if (!card || ratingSubmitting) return;
    setRatingSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;
      await submitCardRating(card.card_name, rating, token);
      setUserRating(rating);
    } catch {
      // Silently fail
    } finally {
      setRatingSubmitting(false);
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
                  <CardImage
                    cardImageLink={card.card_image_link}
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

            {/* Rating */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {userRating ? 'Your rating (click to change):' : 'Rate this card:'}
              </label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = (hoveredRating ?? userRating ?? 0) >= star;
                  const colors = RATING_COLORS[hoveredRating ?? userRating ?? star];
                  return (
                    <button
                      key={star}
                      onClick={() => handleRate(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(null)}
                      disabled={ratingSubmitting}
                      className={`p-1.5 rounded-lg transition-colors ${
                        active ? colors.bg : 'hover:bg-gray-100'
                      } ${ratingSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      title={RATING_LABELS[star]}
                    >
                      <StarIcon
                        filled={active}
                        className={`h-6 w-6 ${active ? colors.fill : 'text-gray-300'}`}
                      />
                    </button>
                  );
                })}
                {(hoveredRating ?? userRating) && (
                  <span className={`ml-2 text-sm font-medium ${RATING_COLORS[hoveredRating ?? userRating!].text}`}>
                    {RATING_LABELS[hoveredRating ?? userRating!]}
                  </span>
                )}
              </div>
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
