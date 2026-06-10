'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import CardImage from '@/components/ui/CardImage';
import {
  Card,
  WalletCard,
  getAllCards,
  productChangeWalletCard,
} from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';

interface ProductChangeModalProps {
  show: boolean;
  card: WalletCard | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProductChangeModal({ show, card, onClose, onSuccess }: ProductChangeModalProps) {
  const { getToken } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Card | null>(null);
  const [reason, setReason] = useState<'voluntary' | 'forced' | ''>('');
  const [changeDate, setChangeDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!show) return;
    (async () => {
      try {
        setCards(await getAllCards());
      } catch (err) {
        console.error('Failed to load cards for product change:', err);
      }
    })();
  }, [show]);

  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [show]);

  const sameIssuerCards = useMemo(() => {
    if (!card) return [];
    return cards.filter((c) => {
      if (!c.db_card_id) return false;
      if (c.db_card_id === card.card_id) return false;
      return c.bank?.toLowerCase() === card.bank?.toLowerCase();
    });
  }, [cards, card]);

  const filteredCards = useMemo(() => {
    if (!search) return sameIssuerCards;
    const s = search.toLowerCase();
    return sameIssuerCards.filter((c) => c.card_name.toLowerCase().includes(s));
  }, [sameIssuerCards, search]);

  const resetState = () => {
    setSearch('');
    setSelected(null);
    setReason('');
    setChangeDate(new Date().toISOString().slice(0, 10));
    setNote('');
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSubmit = async () => {
    if (!card || !selected?.db_card_id) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');
      await productChangeWalletCard(
        card.id,
        {
          new_card_id: selected.db_card_id,
          change_date: changeDate || undefined,
          reason: reason || undefined,
          note: note.trim() || undefined,
        },
        token,
      );
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record product change');
    } finally {
      setSaving(false);
    }
  };

  if (!show || !card || !mounted) return null;

  return createPortal(
    <div className="landing-v2 profile-v2">
      <div className="cj-modal-root" role="dialog" aria-modal="true">
        <div className="cj-modal-backdrop" onClick={handleClose} />
        <div className="cj-modal-shell">
          <div className="cj-modal-card cj-modal-card-bounded" style={{ maxWidth: 560 }}>
            <div className="cj-modal-head">
              <span className="cj-status-dot" />
              <span className="cj-modal-title">product change</span>
              <button type="button" className="cj-modal-close" onClick={handleClose} aria-label="Close">
                <XMarkIcon style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <div className="cj-modal-body">
              {error && <div className="cj-modal-error">{error}</div>}

              <div className="cj-modal-section">
                <div className="cj-modal-card-row">
                  <span className="cj-modal-thumb">
                    <CardImage cardImageLink={card.card_image_link} alt={card.card_name} fill className="object-contain" sizes="56px" />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="cj-modal-card-name">{card.card_name}</div>
                    <div className="cj-modal-card-meta">
                      {card.bank} · current card
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
                  Pick the new {card.bank} card this account was converted to. We keep the open date and the wallet slot, and record the change in your history.
                </p>
              </div>

              {!selected ? (
                <>
                  <div className="cj-modal-section">
                    <label className="cj-modal-label">Search {card.bank} cards</label>
                    <div className="cj-modal-search">
                      <MagnifyingGlassIcon className="cj-modal-search-icon" />
                      <input
                        type="text"
                        placeholder={`${card.bank} card name…`}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="cj-modal-search-input"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="cj-modal-section">
                    <div className="cj-modal-list">
                      {filteredCards.slice(0, 20).map((c) => (
                        <button
                          key={c.card_id}
                          type="button"
                          onClick={() => setSelected(c)}
                          className="cj-modal-list-row"
                        >
                          <span className="cj-modal-thumb">
                            <CardImage cardImageLink={c.card_image_link} alt={c.card_name} fill className="object-contain" sizes="56px" />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="cj-modal-list-name">{c.card_name}</div>
                            <div className="cj-modal-list-meta">{c.bank}</div>
                          </div>
                        </button>
                      ))}
                      {filteredCards.length === 0 && (
                        <div className="cj-modal-list-empty">
                          {sameIssuerCards.length === 0
                            ? `No other ${card.bank} cards available`
                            : 'No cards match'}
                        </div>
                      )}
                      {filteredCards.length > 20 && (
                        <div className="cj-modal-list-foot">
                          showing first 20, refine your search to see more
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
                        <CardImage cardImageLink={selected.card_image_link} alt={selected.card_name} fill className="object-contain" sizes="56px" />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="cj-modal-card-name">{selected.card_name}</div>
                        <div className="cj-modal-card-meta">{selected.bank} · new card</div>
                      </div>
                    </div>
                    <button type="button" className="cj-modal-back" onClick={() => setSelected(null)}>
                      ← choose a different card
                    </button>
                  </div>

                  <div className="cj-modal-section">
                    <label className="cj-modal-label">Change date</label>
                    <input
                      type="date"
                      value={changeDate}
                      onChange={(e) => setChangeDate(e.target.value)}
                      className="cj-modal-select"
                      max={new Date().toISOString().slice(0, 10)}
                    />
                  </div>

                  <div className="cj-modal-section">
                    <label className="cj-modal-label">Reason <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--muted-2)' }}>(optional)</span></label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {([
                        { value: 'voluntary', label: 'I requested it' },
                        { value: 'forced', label: 'Bank initiated' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setReason(reason === opt.value ? '' : opt.value)}
                          className={'cj-modal-btn' + (reason === opt.value ? ' cj-modal-btn-primary' : '')}
                          style={{ flex: 1 }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="cj-modal-section">
                    <label className="cj-modal-label">Note <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--muted-2)' }}>(optional)</span></label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value.slice(0, 500))}
                      className="cj-modal-select"
                      rows={2}
                      placeholder="Anything to remember about this change…"
                      style={{ resize: 'vertical', minHeight: 56 }}
                    />
                  </div>
                </>
              )}
            </div>

            {selected && (
              <div className="cj-modal-footer">
                <span style={{ fontSize: 11, color: 'var(--muted)' }} />
                <div className="cj-modal-actions">
                  <button type="button" className="cj-modal-btn" onClick={handleClose}>cancel</button>
                  <button
                    type="button"
                    className="cj-modal-btn cj-modal-btn-primary"
                    onClick={handleSubmit}
                    disabled={saving}
                  >
                    {saving ? 'saving…' : 'record product change'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
