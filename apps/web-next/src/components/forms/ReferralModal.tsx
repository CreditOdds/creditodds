'use client';

import { useState } from 'react';
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import CardImage from '@/components/ui/CardImage';
import { useAuth } from '@/auth/AuthProvider';
import { toast } from 'react-toastify';

interface OpenReferral {
  card_id: string;
  card_name: string;
  card_image_link?: string;
  card_referral_link?: string;
}

interface ReferralModalProps {
  show: boolean;
  handleClose: () => void;
  openReferrals: OpenReferral[];
  onSuccess: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://d2ojrhbh2dincr.cloudfront.net';

function validateUrl(value: string): string | null {
  if (!value) return 'Required';
  if (value.length < 10) return 'Referral URL must be at least 10 characters';
  if (value.length > 500) return 'Referral URL cannot be more than 500 characters';
  if (!/^https?:\/\//.test(value)) return 'URL must start with https://';
  return null;
}

export default function ReferralModal({ show, handleClose, openReferrals, onSuccess }: ReferralModalProps) {
  const { getToken } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<OpenReferral | null>(null);
  const [referralLink, setReferralLink] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validationError = validateUrl(referralLink);

  const filtered = openReferrals.filter(card => {
    if (!search) return true;
    const s = search.toLowerCase();
    return card.card_name.toLowerCase().includes(s);
  });

  const reset = () => {
    setSearch('');
    setSelected(null);
    setReferralLink('');
    setTouched(false);
    setError(null);
    setSubmitting(false);
  };

  const close = () => {
    reset();
    handleClose();
  };

  const submit = async () => {
    setTouched(true);
    if (!selected || validationError) return;

    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`${API_BASE}/referrals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          card_id: selected.card_id,
          referral_link: referralLink,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to submit referral');
      }

      toast.success('Your referral was submitted!', { position: 'top-right', autoClose: 5000 });
      onSuccess();
      close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to submit referral';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!show) return null;

  return (
    <div className="cj-modal-root" role="dialog" aria-modal="true">
      <div className="cj-modal-backdrop" onClick={close} />
      <div className="cj-modal-shell">
        <div className="cj-modal-card" style={{ maxWidth: 520 }}>
          <div className="cj-modal-head">
            <span className="cj-status-dot" />
            <span className="cj-modal-title">submit a referral link</span>
            <button type="button" className="cj-modal-close" onClick={close} aria-label="Close">
              <XMarkIcon style={{ width: 16, height: 16 }} />
            </button>
          </div>

          <div className="cj-modal-body">
            {error && <div className="cj-modal-error">{error}</div>}

            {!selected ? (
              <>
                {openReferrals.length === 0 ? (
                  <div className="cj-modal-section">
                    <div className="cj-modal-list-empty">
                      No eligible cards. Add a card to your wallet or submit a record to submit a referral.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="cj-modal-section">
                      <label className="cj-modal-label">Search</label>
                      <div className="cj-modal-search">
                        <MagnifyingGlassIcon className="cj-modal-search-icon" />
                        <input
                          type="text"
                          placeholder="card name…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="cj-modal-search-input"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="cj-modal-section">
                      <div className="cj-modal-list">
                        {filtered.slice(0, 20).map((card) => (
                          <button
                            key={card.card_id}
                            type="button"
                            onClick={() => setSelected(card)}
                            className="cj-modal-list-row"
                          >
                            <span className="cj-modal-thumb">
                              <CardImage
                                cardImageLink={card.card_image_link}
                                alt={card.card_name}
                                fill
                                className="object-contain"
                                sizes="56px"
                              />
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div className="cj-modal-list-name">{card.card_name}</div>
                            </div>
                          </button>
                        ))}
                        {filtered.length === 0 && (
                          <div className="cj-modal-list-empty">no cards match</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="cj-modal-section">
                  <div className="cj-modal-card-row">
                    <span className="cj-modal-thumb">
                      <CardImage
                        cardImageLink={selected.card_image_link}
                        alt={selected.card_name}
                        fill
                        className="object-contain"
                        sizes="56px"
                      />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="cj-modal-card-name">{selected.card_name}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="cj-modal-back"
                    onClick={() => { setSelected(null); setReferralLink(''); setTouched(false); }}
                  >
                    ← choose a different card
                  </button>
                </div>

                <div className="cj-modal-section">
                  <label className="cj-modal-label" htmlFor="referral_link">Referral URL</label>
                  <input
                    id="referral_link"
                    type="url"
                    inputMode="url"
                    placeholder="https://…"
                    value={referralLink}
                    onChange={(e) => setReferralLink(e.target.value)}
                    onBlur={() => setTouched(true)}
                    className="cj-modal-input"
                  />
                  {touched && validationError && (
                    <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--warn)' }}>{validationError}</div>
                  )}
                </div>
              </>
            )}
          </div>

          {selected && (
            <div className="cj-modal-footer">
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{/* spacer */}</span>
              <div className="cj-modal-actions">
                <button type="button" className="cj-modal-btn" onClick={close}>cancel</button>
                <button
                  type="button"
                  className="cj-modal-btn cj-modal-btn-primary"
                  onClick={submit}
                  disabled={submitting || !!validationError}
                >
                  {submitting ? 'submitting…' : 'submit'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
