'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Card, getAllCards, addToWallet } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';

interface AddToWalletModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingCardIds: number[];
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

export default function AddToWalletModal({ show, onClose, onSuccess, existingCardIds }: AddToWalletModalProps) {
  const { getToken } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [acquiredMonth, setAcquiredMonth] = useState<number | undefined>();
  const [acquiredYear, setAcquiredYear] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate year options (current year back to 1990)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1989 }, (_, i) => currentYear - i);

  useEffect(() => {
    if (show) {
      loadCards();
    }
  }, [show]);

  const loadCards = async () => {
    try {
      const allCards = await getAllCards();
      setCards(allCards);
    } catch (err) {
      console.error('Failed to load cards:', err);
    }
  };

  const filteredCards = cards.filter(card => {
    // Exclude cards already in wallet or cards without db_card_id
    if (!card.db_card_id) return false;
    if (existingCardIds.includes(card.db_card_id)) return false;

    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      card.card_name.toLowerCase().includes(searchLower) ||
      card.bank.toLowerCase().includes(searchLower)
    );
  });

  const handleSubmit = async () => {
    if (!selectedCard || !selectedCard.db_card_id) return;

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      await addToWallet(
        selectedCard.db_card_id,
        acquiredMonth,
        acquiredYear,
        token || undefined
      );
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add card to wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedCard(null);
    setSearch('');
    setAcquiredMonth(undefined);
    setAcquiredYear(undefined);
    setError(null);
    onClose();
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleClose} />

        {/* Modal */}
        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
          <div className="bg-white px-4 pb-4 pt-5 sm:p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Card to Wallet</h3>
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

            {!selectedCard ? (
              <>
                {/* Search */}
                <div className="relative mb-4">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search cards..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-md border-gray-300 pl-10 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>

                {/* Card List */}
                <div className="max-h-80 overflow-y-auto space-y-2">
                  {filteredCards.slice(0, 20).map((card) => (
                    <button
                      key={card.card_id}
                      onClick={() => setSelectedCard(card)}
                      className="w-full flex items-center p-3 rounded-lg border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-left"
                    >
                      <div className="h-10 w-16 flex-shrink-0 mr-3">
                        <Image
                          src={card.card_image_link
                            ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                            : '/assets/generic-card.svg'}
                          alt={card.card_name}
                          width={64}
                          height={40}
                          className="h-10 w-16 object-contain"
                        />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{card.card_name}</div>
                        <div className="text-xs text-gray-500">{card.bank}</div>
                      </div>
                    </button>
                  ))}
                  {filteredCards.length === 0 && (
                    <p className="text-center text-gray-500 py-4">No cards found</p>
                  )}
                  {filteredCards.length > 20 && (
                    <p className="text-center text-gray-400 text-sm py-2">
                      Showing first 20 results. Refine your search for more.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Selected Card */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <div className="h-12 w-20 flex-shrink-0 mr-4">
                      <Image
                        src={selectedCard.card_image_link
                          ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${selectedCard.card_image_link}`
                          : '/assets/generic-card.svg'}
                        alt={selectedCard.card_name}
                        width={80}
                        height={48}
                        className="h-12 w-20 object-contain"
                      />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{selectedCard.card_name}</div>
                      <div className="text-sm text-gray-500">{selectedCard.bank}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedCard(null)}
                    className="mt-2 text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Choose different card
                  </button>
                </div>

                {/* Acquired Date (Optional) */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    When did you get this card? (Optional)
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
                <div className="flex justify-end gap-3">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {loading ? 'Adding...' : 'Add to Wallet'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
