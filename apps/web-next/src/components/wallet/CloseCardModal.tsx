'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import CardImage from '@/components/ui/CardImage';
import { WalletCard, closeWalletCard } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';

interface CloseCardModalProps {
  show: boolean;
  card: WalletCard | null;
  // Display name override for duplicated cards (e.g. "Citi Custom Cash A").
  displayName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function CloseCardModal({ show, card, displayName, onClose, onSuccess }: CloseCardModalProps) {
  const { getToken } = useAuth();
  const [reason, setReason] = useState<'voluntary' | 'forced' | ''>('');
  const [closeDate, setCloseDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [show]);

  const resetState = () => {
    setReason('');
    setCloseDate(new Date().toISOString().slice(0, 10));
    setNote('');
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSubmit = async () => {
    if (!card) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');
      await closeWalletCard(
        card.id,
        {
          close_date: closeDate || undefined,
          reason: reason || undefined,
          note: note.trim() || undefined,
        },
        token,
      );
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close card');
    } finally {
      setSaving(false);
    }
  };

  if (!show || !card || !mounted) return null;

  const openedLabel = (() => {
    if (!card.acquired_month && !card.acquired_year) return null;
    const m = card.acquired_month ? MONTHS_SHORT[card.acquired_month - 1] : '';
    if (card.acquired_year) return `${m ? m + ' ' : ''}${card.acquired_year}`;
    return m || null;
  })();

  return createPortal(
    <div className="landing-v2 profile-v2">
      <div className="cj-modal-root" role="dialog" aria-modal="true">
        <div className="cj-modal-backdrop" onClick={handleClose} />
        <div className="cj-modal-shell">
          <div className="cj-modal-card cj-modal-card-bounded" style={{ maxWidth: 520 }}>
            <div className="cj-modal-head">
              <span className="cj-status-dot" />
              <span className="cj-modal-title">close card</span>
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
                    <div className="cj-modal-card-name">{displayName ?? card.card_name}</div>
                    <div className="cj-modal-card-meta">
                      {card.bank}{openedLabel ? ` · opened ${openedLabel}` : ''}
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
                  Closing removes this card from your wallet but keeps its history, so it still counts toward your length of credit history. To erase it entirely, use “remove from wallet” instead.
                </p>
              </div>

              <div className="cj-modal-section">
                <label className="cj-modal-label">Close date</label>
                <input
                  type="date"
                  value={closeDate}
                  onChange={(e) => setCloseDate(e.target.value)}
                  className="cj-modal-select"
                  max={new Date().toISOString().slice(0, 10)}
                />
              </div>

              <div className="cj-modal-section">
                <label className="cj-modal-label">Reason <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--muted-2)' }}>(optional)</span></label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([
                    { value: 'voluntary', label: 'I closed it' },
                    { value: 'forced', label: 'Bank closed it' },
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
                  placeholder="Anything to remember about this closure…"
                  style={{ resize: 'vertical', minHeight: 56 }}
                />
              </div>
            </div>

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
                  {saving ? 'closing…' : 'close card'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
