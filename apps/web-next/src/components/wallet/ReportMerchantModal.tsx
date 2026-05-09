'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import {
  BestCardHereReportPayload,
  BestCardHereReportReason,
  submitBestCardHereReport,
} from '@/lib/api';

interface ReportMerchantModalProps {
  show: boolean;
  onClose: () => void;
  payload: Omit<BestCardHereReportPayload, 'reason' | 'notes'>;
}

const REASONS: ReadonlyArray<{
  value: BestCardHereReportReason;
  label: string;
  hint?: string;
}> = [
  { value: 'wrong_category', label: 'Wrong category for this merchant', hint: 'e.g. listed as dining but it should be grocery' },
  { value: 'wrong_card', label: 'Wrong card recommended', hint: 'I have a better card in my wallet for this' },
  { value: 'merchant_missing', label: "This merchant doesn't exist or is closed" },
  { value: 'other', label: 'Something else' },
];

const NOTES_MAX = 1000;
const THANKS_AUTOCLOSE_MS = 2000;

export default function ReportMerchantModal({ show, onClose, payload }: ReportMerchantModalProps) {
  const [reason, setReason] = useState<BestCardHereReportReason>('wrong_category');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!show) {
      setReason('wrong_category');
      setNotes('');
      setSubmitting(false);
      setError(null);
      setSubmitted(false);
    }
  }, [show]);

  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(onClose, THANKS_AUTOCLOSE_MS);
    return () => clearTimeout(t);
  }, [submitted, onClose]);

  // Lock body scroll while the modal is open. Use plain overflow:hidden
  // (NOT the position:fixed pattern) — combining position:fixed body
  // lock with the portal-rendered modal froze touch input on iPhone
  // because the body and the modal both became fixed-positioned, and
  // iOS Safari handles nested position:fixed poorly. Now that the
  // modal lives at body level via createPortal, inner scroll inside
  // the bounded card works without needing the position:fixed trick.
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  if (!show || !mounted) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submitBestCardHereReport({
        ...payload,
        reason,
        notes: notes.trim() || undefined,
      });
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  // Render the modal at <body> via a portal. Without this, the modal's
  // position:fixed root is constrained by any ancestor that creates a
  // containing block (transform / filter / will-change / contain). The
  // profile page's sticky/transformed wrappers were doing exactly that
  // on iPhone, breaking touch scroll inside the card. Body-level portal
  // sidesteps the entire ancestor chain.
  return createPortal(
    <div className="cj-modal-root" role="dialog" aria-modal="true">
      <div className="cj-modal-backdrop" onClick={submitting ? undefined : onClose} />
      <div className="cj-modal-shell">
        <div className="cj-modal-card cj-modal-card-bounded" style={{ maxWidth: 480 }}>
          <div className="cj-modal-head">
            <span className="cj-status-dot" />
            <span className="cj-modal-title">report this match</span>
            <button
              type="button"
              className="cj-modal-close"
              onClick={onClose}
              aria-label="Close"
              disabled={submitting}
            >
              <XMarkIcon style={{ width: 16, height: 16 }} />
            </button>
          </div>

          {submitted ? (
            <div className="cj-modal-body" style={{ alignItems: 'center', textAlign: 'center', padding: '32px 24px 28px' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 999,
                  background: 'var(--accent-2)',
                  color: 'var(--accent)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}
              >
                <CheckIcon style={{ width: 28, height: 28, strokeWidth: 2.5 }} />
              </span>
              <div style={{
                fontFamily: "'Inter Tight', sans-serif",
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: 'var(--ink)',
              }}>
                Thanks — we&apos;ll take a look.
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
                Reports help us tune the merchant picker. We review them weekly.
              </div>
            </div>
          ) : (
            <>
              <div className="cj-modal-body">
                {error && <div className="cj-modal-error">{error}</div>}

                <div className="cj-modal-section">
                  <div className="cj-bch-report-target">
                    <b>{payload.merchant_name}</b>
                    {payload.merchant_category ? <> · {payload.merchant_category}</> : null}
                    {payload.merchant_distance ? <> · {payload.merchant_distance}</> : null}
                    {payload.recommended_card_name && (
                      <div style={{ marginTop: 4 }}>
                        We recommended <b>{payload.recommended_card_name}</b>
                        {payload.rate_label ? <> at {payload.rate_label}</> : null}
                        {payload.rate_context ? <> {payload.rate_context}</> : null}.
                      </div>
                    )}
                  </div>
                </div>

                <div className="cj-modal-section">
                  <span className="cj-modal-label">What&apos;s wrong?</span>
                  <div className="cj-bch-report-reasons" role="radiogroup" aria-label="Report reason">
                    {REASONS.map((r) => {
                      const isOn = reason === r.value;
                      return (
                        <label key={r.value} className={'cj-bch-report-reason' + (isOn ? ' is-on' : '')}>
                          <input
                            type="radio"
                            name="bch-report-reason"
                            value={r.value}
                            checked={isOn}
                            onChange={() => setReason(r.value)}
                          />
                          <span className="cj-bch-report-reason-copy">
                            {r.label}
                            {r.hint && <small>{r.hint}</small>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="cj-modal-section">
                  <label className="cj-modal-label" htmlFor="bch-report-notes">
                    Add detail{' '}
                    <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--muted-2)' }}>
                      (optional)
                    </span>
                  </label>
                  <textarea
                    id="bch-report-notes"
                    className="cj-bch-report-notes"
                    placeholder="What's the right category, card, or behavior?"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
                    rows={3}
                    maxLength={NOTES_MAX}
                  />
                  <div style={{ fontSize: 10, color: 'var(--muted-2)', textAlign: 'right', marginTop: 4 }}>
                    {notes.length} / {NOTES_MAX}
                  </div>
                </div>

                <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                  We log your wallet size and the merchant shown. We don&apos;t store your coordinates.
                </div>
              </div>

              <div className="cj-modal-footer">
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{/* spacer */}</span>
                <div className="cj-modal-actions">
                  <button
                    type="button"
                    className="cj-modal-btn"
                    onClick={onClose}
                    disabled={submitting}
                  >
                    cancel
                  </button>
                  <button
                    type="button"
                    className="cj-modal-btn cj-modal-btn-primary"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? 'sending…' : 'send report'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
