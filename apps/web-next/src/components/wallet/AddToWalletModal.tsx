'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import CardImage from '@/components/ui/CardImage';
import { Card, getAllCards, addToWallet } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';

interface AddToWalletModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingCardIds: number[];
}

const months = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
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

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1989 }, (_, i) => currentYear - i);

  useEffect(() => {
    if (show) {
      (async () => {
        try {
          setCards(await getAllCards());
        } catch (err) {
          console.error('Failed to load cards:', err);
        }
      })();
    }
  }, [show]);

  const existingCardIdSet = new Set(existingCardIds);

  const filteredCards = cards.filter(card => {
    if (!card.db_card_id) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return card.card_name.toLowerCase().includes(s) || card.bank.toLowerCase().includes(s);
  });

  const handleSubmit = async () => {
    if (!selectedCard || !selectedCard.db_card_id) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      await addToWallet(selectedCard.db_card_id, acquiredMonth, acquiredYear, token || undefined);
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
    <div className="cj-modal-root" role="dialog" aria-modal="true">
      <div className="cj-modal-backdrop" onClick={handleClose} />
      <div className="cj-modal-shell">
        <div className="cj-modal-card" style={{ maxWidth: 520 }}>
          <div className="cj-modal-head">
            <span className="cj-status-dot" />
            <span className="cj-modal-title">add a card to your wallet</span>
            <button type="button" className="cj-modal-close" onClick={handleClose} aria-label="Close">
              <XMarkIcon style={{ width: 16, height: 16 }} />
            </button>
          </div>

          <div className="cj-modal-body">
            {error && <div className="cj-modal-error">{error}</div>}

            {!selectedCard ? (
              <>
                <div className="cj-modal-section">
                  <label className="cj-modal-label">Search</label>
                  <div className="cj-modal-search">
                    <MagnifyingGlassIcon className="cj-modal-search-icon" />
                    <input
                      type="text"
                      placeholder="card name or issuer…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="cj-modal-search-input"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="cj-modal-section">
                  <div className="cj-modal-list">
                    {filteredCards.slice(0, 20).map((card) => {
                      const alreadyHeld = card.db_card_id !== undefined && existingCardIdSet.has(card.db_card_id);
                      return (
                        <button
                          key={card.card_id}
                          type="button"
                          onClick={() => setSelectedCard(card)}
                          className="cj-modal-list-row"
                        >
                          <span className="cj-modal-thumb">
                            <CardImage cardImageLink={card.card_image_link} alt={card.card_name} fill className="object-contain" sizes="56px" />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="cj-modal-list-name">{card.card_name}</div>
                            <div className="cj-modal-list-meta">
                              {card.bank}{alreadyHeld ? ' · already in your wallet' : ''}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {filteredCards.length === 0 && (
                      <div className="cj-modal-list-empty">no cards match</div>
                    )}
                    {filteredCards.length > 20 && (
                      <div className="cj-modal-list-foot">
                        showing first 20 — refine your search to see more
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="cj-modal-section">
                  <div className="cj-modal-card-row">
                    <span className="cj-modal-thumb">
                      <CardImage cardImageLink={selectedCard.card_image_link} alt={selectedCard.card_name} fill className="object-contain" sizes="56px" />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="cj-modal-card-name">{selectedCard.card_name}</div>
                      <div className="cj-modal-card-meta">{selectedCard.bank}</div>
                    </div>
                  </div>
                  <button type="button" className="cj-modal-back" onClick={() => setSelectedCard(null)}>
                    ← choose a different card
                  </button>
                </div>

                <div className="cj-modal-section">
                  <label className="cj-modal-label">When did you get this card? <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--muted-2)' }}>(optional)</span></label>
                  <div className="cj-modal-grid">
                    <select
                      value={acquiredMonth || ''}
                      onChange={(e) => setAcquiredMonth(e.target.value ? Number(e.target.value) : undefined)}
                      className="cj-modal-select"
                    >
                      <option value="">Month</option>
                      {months.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <select
                      value={acquiredYear || ''}
                      onChange={(e) => setAcquiredYear(e.target.value ? Number(e.target.value) : undefined)}
                      className="cj-modal-select"
                    >
                      <option value="">Year</option>
                      {years.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>

          {selectedCard && (
            <div className="cj-modal-footer">
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{/* spacer */}</span>
              <div className="cj-modal-actions">
                <button type="button" className="cj-modal-btn" onClick={handleClose}>cancel</button>
                <button
                  type="button"
                  className="cj-modal-btn cj-modal-btn-primary"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? 'adding…' : 'add to wallet'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
