'use client';

import { useEffect, useRef, useState } from 'react';
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
}> = [
  { value: 'wrong_category', label: 'Wrong category' },
  { value: 'wrong_card', label: 'Wrong card recommended' },
  { value: 'merchant_missing', label: "Merchant doesn't exist / closed" },
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
  const scrollYRef = useRef(0);

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

  // iOS-safe body scroll lock. Plain `body { overflow: hidden }` blocks
  // page scroll but on iOS Safari it also breaks touch scrolling inside
  // descendant scroll containers, which is what kept the report card
  // from scrolling on iPhone 16. Pinning body with `position: fixed`
  // + restoring scrollY on cleanup is the well-known workaround.
  useEffect(() => {
    if (!show) return;
    scrollYRef.current = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollYRef.current}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollYRef.current);
    };
  }, [show]);

  if (!show) return null;

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

  return (
    <div className="cj-modal-root" role="dialog" aria-modal="true">
      <div className="cj-modal-backdrop" onClick={submitting ? undefined : onClose} />
      <div className="cj-modal-shell">
        <div className="cj-modal-card cj-modal-card-bounded" style={{ maxWidth: 480 }}>
          <div className="cj-modal-head">
            <span className="cj-status-dot" />
            <span className="cj-modal-title">report this match</span>
            {!submitted && (
              <button
                type="button"
                className="cj-bch-report-send"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'sending…' : 'send'}
              </button>
            )}
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
                Reports help us tune the merchant picker.
              </div>
            </div>
          ) : (
            <div className="cj-modal-body">
              {error && <div className="cj-modal-error">{error}</div>}

              <div className="cj-modal-section">
                <div className="cj-bch-report-target">
                  <b>{payload.merchant_name}</b>
                  {payload.merchant_category ? <> · {payload.merchant_category}</> : null}
                  {payload.recommended_card_name && (
                    <> · we said <b>{payload.recommended_card_name}</b>{payload.rate_label ? <> ({payload.rate_label})</> : null}</>
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
                        <span className="cj-bch-report-reason-copy">{r.label}</span>
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
                  placeholder="What's the right category or card?"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
                  rows={2}
                  maxLength={NOTES_MAX}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
