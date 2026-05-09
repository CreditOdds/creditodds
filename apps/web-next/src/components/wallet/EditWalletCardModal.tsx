'use client';

import { useState, useEffect } from 'react';
import CardImage from '@/components/ui/CardImage';
import Link from 'next/link';
import { XMarkIcon, TrashIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { addToWallet, removeFromWallet, WalletCard, getUserCardRating, submitCardRating } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';

interface EditWalletCardModalProps {
  show: boolean;
  card: WalletCard | null;
  cardSlug?: string;
  annualFee?: number;
  onClose: () => void;
  onSuccess: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'very bad',
  2: 'bad',
  3: 'average',
  4: 'good',
  5: 'very good',
};

function StarIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? '0' : '1.5'} xmlns="http://www.w3.org/2000/svg">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

const months = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
];

export default function EditWalletCardModal({ show, card, cardSlug, annualFee, onClose, onSuccess }: EditWalletCardModalProps) {
  const { getToken } = useAuth();
  const [acquiredMonth, setAcquiredMonth] = useState<number | undefined>();
  const [acquiredYear, setAcquiredYear] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1989 }, (_, i) => currentYear - i);

  useEffect(() => {
    if (card) {
      setAcquiredMonth(card.acquired_month);
      setAcquiredYear(card.acquired_year);
      setError(null);
      const preloaded = card.user_rating;
      setUserRating(preloaded ?? null);
      // Fall back to a fetch only when the wallet payload didn't include the rating
      // (e.g. older API deployments before user_rating was added to GET /wallet).
      if (preloaded === undefined) {
        (async () => {
          const token = await getToken();
          if (!token) return;
          const rating = await getUserCardRating(card.card_name, token);
          setUserRating(rating);
        })();
      }
    }
  }, [card, getToken]);

  const handleSave = async () => {
    if (!card) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      await addToWallet(card.card_id, acquiredMonth, acquiredYear, token || undefined);
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

  const activeRating = hoveredRating ?? userRating ?? 0;
  const acquiredLabel = (() => {
    if (!card.acquired_month && !card.acquired_year) return null;
    const m = card.acquired_month ? new Date(2000, card.acquired_month - 1).toLocaleString('default', { month: 'short' }) : '';
    return card.acquired_year ? `since ${m ? m + ' ' : ''}${card.acquired_year}` : `since ${m}`;
  })();

  return (
    <div className="cj-modal-root" role="dialog" aria-modal="true">
      <div className="cj-modal-backdrop" onClick={handleClose} />
      <div className="cj-modal-shell">
        <div className="cj-modal-card">
          <div className="cj-modal-head">
            <span className="cj-status-dot" />
            <span className="cj-modal-title">edit card</span>
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
                    {card.bank}{acquiredLabel ? ` · ${acquiredLabel}` : ''}
                  </div>
                </div>
              </div>
              {cardSlug && (
                <Link href={`/card/${cardSlug}`} className="cj-modal-link">
                  view card details <ArrowTopRightOnSquareIcon style={{ width: 11, height: 11 }} />
                </Link>
              )}
            </div>

            <div className="cj-modal-section">
              <label className="cj-modal-label">{userRating ? 'Your rating' : 'Rate this card'}</label>
              <div className="cj-modal-stars">
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = activeRating >= star;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRate(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(null)}
                      disabled={ratingSubmitting}
                      className={'cj-modal-star' + (active ? ' is-active' : '')}
                      title={RATING_LABELS[star]}
                      aria-label={`Rate ${star} of 5`}
                    >
                      <StarIcon filled={active} className="h-5 w-5" />
                    </button>
                  );
                })}
                {activeRating > 0 && (
                  <span className="cj-modal-star-label">{RATING_LABELS[activeRating]}</span>
                )}
              </div>
            </div>

            {(annualFee ?? 0) > 0 && (
              <div className="cj-modal-section">
                <label className="cj-modal-label">When did you get this card? <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--muted-2)' }}>(used to track renewals)</span></label>
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
            )}
          </div>

          <div className="cj-modal-footer">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="cj-modal-danger"
            >
              <TrashIcon style={{ width: 12, height: 12 }} />
              {deleting ? 'removing…' : 'remove from wallet'}
            </button>
            <div className="cj-modal-actions">
              <button type="button" className="cj-modal-btn" onClick={handleClose}>
                cancel
              </button>
              <button
                type="button"
                className="cj-modal-btn cj-modal-btn-primary"
                onClick={handleSave}
                disabled={saving || deleting}
              >
                {saving ? 'saving…' : 'save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
