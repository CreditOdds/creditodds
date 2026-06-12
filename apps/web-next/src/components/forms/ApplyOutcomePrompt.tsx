'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import CardImage from '@/components/ui/CardImage';
import { trackApplyOutcome, type ApplyOutcome } from '@/lib/api';

// Post-apply check-in (concept). CardClient drops a localStorage flag when
// the visitor clicks an apply link. When this tab becomes visible again
// after at least MIN_AWAY_MS on the issuer site — or the visitor returns to
// the card page in a later session — we ask how it went. One tap records an
// anonymous outcome (tier 1); Approved/Denied answers get an upsell into
// the full SubmitRecordModal (tier 2).

// Long enough that a quick bounce off the issuer page doesn't trigger the
// prompt; short enough to catch a same-session return. For local testing,
// ?apply_prompt_demo=1 bypasses the wait entirely.
const MIN_AWAY_MS = 2 * 60 * 1000;
// Ignore apply clicks older than this — the moment has passed.
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export const APPLY_PENDING_KEY_PREFIX = 'creditodds_apply_pending_';

export function markApplyPending(cardId: number) {
  if (!Number.isInteger(cardId) || cardId <= 0) return;
  try {
    localStorage.setItem(
      `${APPLY_PENDING_KEY_PREFIX}${cardId}`,
      JSON.stringify({ ts: Date.now() })
    );
  } catch {
    // Ignore storage errors
  }
}

interface PromptCard {
  card_id: string | number;
  card_name: string;
  card_image_link?: string;
}

interface ApplyOutcomePromptProps {
  card: PromptCard;
  // Open the full record form prefilled with the tapped outcome.
  onAddDetails: (result: boolean) => void;
}

type Stage = 'hidden' | 'ask' | 'upsell' | 'thanks';

const approvedBtnStyle: React.CSSProperties = {
  background: '#15803d',
  borderColor: '#15803d',
  color: '#fff',
  fontWeight: 600,
};

const deniedBtnStyle: React.CSSProperties = {
  background: 'var(--warn)',
  borderColor: 'var(--warn)',
  color: '#fff',
  fontWeight: 600,
};

export default function ApplyOutcomePrompt({ card, onAddDetails }: ApplyOutcomePromptProps) {
  // Starts 'hidden' and only ever changes from async callbacks (timers,
  // visibility events), so the first render is null on both server and
  // client — no separate portal mount guard needed.
  const [stage, setStage] = useState<Stage>('hidden');
  const [thanksMsg, setThanksMsg] = useState('');
  // Once the visitor answers or dismisses, stay quiet for the session.
  const answeredRef = useRef(false);
  const lastResultRef = useRef(true);

  const cardId = Number(card.card_id);
  const storageKey = `${APPLY_PENDING_KEY_PREFIX}${cardId}`;

  const readPendingTs = useCallback((): number | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const ts = JSON.parse(raw)?.ts;
      if (typeof ts !== 'number') return null;
      if (Date.now() - ts > MAX_AGE_MS) {
        localStorage.removeItem(storageKey);
        return null;
      }
      return ts;
    } catch {
      return null;
    }
  }, [storageKey]);

  useEffect(() => {
    const maybeShow = () => {
      if (answeredRef.current) return;
      const ts = readPendingTs();
      if (ts !== null && Date.now() - ts >= MIN_AWAY_MS) {
        setStage((s) => (s === 'hidden' ? 'ask' : s));
      }
    };

    // Demo hook: ?apply_prompt_demo=1 seeds the flag and shows immediately.
    const isDemo =
      new URLSearchParams(window.location.search).get('apply_prompt_demo') === '1';
    if (isDemo) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ ts: Date.now() - MIN_AWAY_MS }));
      } catch {
        // Ignore storage errors
      }
    }

    // Return-visit case: the flag is already old enough on page load.
    const initialTimer = setTimeout(maybeShow, isDemo ? 300 : 1500);

    // In-session case: visitor comes back from the issuer tab.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') maybeShow();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(initialTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [readPendingTs, storageKey]);

  // Auto-dismiss the thanks state.
  useEffect(() => {
    if (stage !== 'thanks') return;
    const t = setTimeout(() => setStage('hidden'), 6000);
    return () => clearTimeout(t);
  }, [stage]);

  const clearFlag = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage errors
    }
  }, [storageKey]);

  const respond = (outcome: ApplyOutcome) => {
    answeredRef.current = true;
    clearFlag();
    if (Number.isInteger(cardId) && cardId > 0) {
      trackApplyOutcome(cardId, outcome).catch(() => {});
    }
    if (outcome === 'approved' || outcome === 'denied') {
      lastResultRef.current = outcome === 'approved';
      setStage('upsell');
    } else if (outcome === 'pending') {
      setThanksMsg('Good luck! Come back when you hear and report the result. It helps everyone see real approval odds.');
      setStage('thanks');
    } else {
      setStage('hidden');
    }
  };

  const dismiss = () => {
    answeredRef.current = true;
    clearFlag();
    setStage('hidden');
  };

  if (stage === 'hidden') return null;

  return createPortal(
    <div className="landing-v2 profile-v2">
      <div className="cj-outcome-prompt" role="dialog" aria-label="Application check-in">
        <div className="cj-outcome-head">
          <span className="cj-outcome-dot" />
          <span className="cj-outcome-title">application check-in</span>
          <button type="button" className="cj-outcome-close" onClick={dismiss} aria-label="Dismiss">
            <XMarkIcon style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {stage === 'ask' && (
          <>
            <div className="cj-outcome-card-row">
              <span className="cj-outcome-thumb">
                <CardImage
                  cardImageLink={card.card_image_link}
                  alt={card.card_name}
                  fill
                  className="object-contain"
                  sizes="72px"
                />
              </span>
              <p className="cj-outcome-q">
                Did you end up applying for the <strong>{card.card_name}</strong>?
              </p>
            </div>
            <div className="cj-outcome-grid">
              <button type="button" className="cj-modal-btn" style={approvedBtnStyle} onClick={() => respond('approved')}>
                Approved
              </button>
              <button type="button" className="cj-modal-btn" style={deniedBtnStyle} onClick={() => respond('denied')}>
                Denied
              </button>
              <button type="button" className="cj-modal-btn" onClick={() => respond('pending')}>
                Still pending
              </button>
              <button type="button" className="cj-modal-btn" onClick={() => respond('just_looking')}>
                Just looking
              </button>
            </div>
            <p className="cj-outcome-foot">One tap, anonymous. No account needed.</p>
          </>
        )}

        {stage === 'upsell' && (
          <>
            <div className="cj-outcome-card-row">
              <span className="cj-outcome-thumb">
                <CardImage
                  cardImageLink={card.card_image_link}
                  alt={card.card_name}
                  fill
                  className="object-contain"
                  sizes="72px"
                />
              </span>
              <p className="cj-outcome-q">
                Thanks! Want it to count toward the <strong>{card.card_name}</strong> approval odds?
              </p>
            </div>
            <p className="cj-outcome-sub">
              Add your score and a couple details. Takes about 30 seconds.
            </p>
            <div className="cj-outcome-grid">
              <button
                type="button"
                className="cj-modal-btn cj-modal-btn-primary"
                onClick={() => {
                  setStage('hidden');
                  onAddDetails(lastResultRef.current);
                }}
              >
                Add details
              </button>
              <button
                type="button"
                className="cj-modal-btn"
                onClick={() => {
                  setThanksMsg('Thanks, every answer helps.');
                  setStage('thanks');
                }}
              >
                No thanks
              </button>
            </div>
          </>
        )}

        {stage === 'thanks' && <p className="cj-outcome-q">{thanksMsg}</p>}
      </div>
    </div>,
    document.body
  );
}
