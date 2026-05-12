'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import CardImage from './CardImage';

const VISITS_KEY = 'ccd_session_card_visits';
const SHOWN_KEY = 'ccd_session_compare_popup_shown';

interface CardyComparePopupProps {
  currentSlug: string;
  currentName: string;
  currentImage?: string | null;
}

interface VisitedCard {
  slug: string;
  name: string;
  image?: string | null;
}

function readVisits(): VisitedCard[] {
  try {
    const raw = sessionStorage.getItem(VISITS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(v => v?.slug && v?.name) : [];
  } catch {
    return [];
  }
}

function writeVisits(visits: VisitedCard[]) {
  try {
    sessionStorage.setItem(VISITS_KEY, JSON.stringify(visits));
  } catch {
    // ignore quota errors
  }
}

export default function CardyComparePopup({ currentSlug, currentName, currentImage }: CardyComparePopupProps) {
  const [visible, setVisible] = useState(false);
  const [previousCard, setPreviousCard] = useState<VisitedCard | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const visits = readVisits();
    const filtered = visits.filter(v => v.slug !== currentSlug);
    const updated = [...filtered, { slug: currentSlug, name: currentName, image: currentImage ?? null }].slice(-10);
    writeVisits(updated);

    if (sessionStorage.getItem(SHOWN_KEY) === 'true') return;

    const priorUniques = filtered;
    if (priorUniques.length === 0) return;

    const prev = priorUniques[priorUniques.length - 1];
    setPreviousCard(prev);

    const timer = setTimeout(() => {
      setVisible(true);
      try {
        sessionStorage.setItem(SHOWN_KEY, 'true');
      } catch {
        // ignore
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [currentSlug, currentName, currentImage]);

  const dismiss = () => {
    setVisible(false);
  };

  if (!visible || !previousCard) return null;

  const compareHref = `/compare?cards=${previousCard.slug},${currentSlug}`;

  return (
    <div
      role="dialog"
      aria-label="Compare these cards"
      className="cmp-pop"
    >
      <style jsx global>{`
        .cmp-pop {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 40;
          width: 340px;
          max-width: calc(100vw - 32px);
          background: #ffffff;
          border: 1px solid #ddd7ec;
          border-radius: 10px;
          padding: 16px 16px 14px;
          box-shadow:
            0 1px 0 rgba(26, 19, 48, 0.04),
            0 16px 40px -16px rgba(109, 63, 232, 0.22);
          font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
          color: #1a1330;
          animation: cmp-pop-in 220ms ease-out;
        }
        @keyframes cmp-pop-in {
          0%   { opacity: 0; transform: translateY(12px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .cmp-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding-bottom: 10px;
          border-bottom: 1px solid #ece8f5;
          margin-bottom: 12px;
        }
        .cmp-eyebrow {
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #6d3fe8;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .cmp-eyebrow::before {
          content: '';
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #6d3fe8;
          box-shadow: 0 0 0 3px rgba(109, 63, 232, 0.18);
        }
        .cmp-close {
          appearance: none;
          background: transparent;
          border: none;
          color: #6b6384;
          cursor: pointer;
          padding: 2px 4px;
          font-size: 16px;
          line-height: 1;
          border-radius: 4px;
        }
        .cmp-close:hover { color: #1a1330; background: #f7f5fc; }
        .cmp-row {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 10px;
          align-items: center;
        }
        .cmp-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }
        .cmp-img {
          position: relative;
          width: 100%;
          aspect-ratio: 1.6 / 1;
          background: #f7f5fc;
          border: 1px solid #ece8f5;
          border-radius: 6px;
          overflow: hidden;
        }
        .cmp-name {
          font-family: 'Inter Tight', 'Inter', sans-serif;
          letter-spacing: -0.01em;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.25;
          color: #1a1330;
          text-align: center;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .cmp-vs {
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #a49fb8;
          padding-top: 14px;
        }
        .cmp-prompt {
          margin: 14px 0 12px;
          font-family: 'Inter Tight', 'Inter', sans-serif;
          letter-spacing: -0.01em;
          font-size: 15px;
          font-weight: 500;
          line-height: 1.3;
          color: #1a1330;
        }
        .cmp-actions {
          display: flex;
          gap: 8px;
        }
        .cmp-btn {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 9px 14px;
          border-radius: 8px;
          font-size: 13.5px;
          font-weight: 600;
          text-decoration: none;
          border: 1px solid transparent;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, transform 0.08s ease;
        }
        .cmp-btn-primary {
          background: #1a1330;
          color: #ffffff;
          border-color: #1a1330;
        }
        .cmp-btn-primary:hover { background: #3a2f55; }
        .cmp-btn-primary:active { transform: translateY(1px); }
        .cmp-btn-ghost {
          background: #ffffff;
          color: #1a1330;
          border-color: #ddd7ec;
          flex: 0 0 auto;
        }
        .cmp-btn-ghost:hover { border-color: #1a1330; }
      `}</style>

      <div className="cmp-head">
        <span className="cmp-eyebrow">Compare</span>
        <button onClick={dismiss} className="cmp-close" aria-label="Dismiss">×</button>
      </div>

      <div className="cmp-row">
        <div className="cmp-card">
          <div className="cmp-img">
            <CardImage
              cardImageLink={previousCard.image ?? undefined}
              alt={previousCard.name}
              fill
              className="object-contain p-1"
              sizes="140px"
            />
          </div>
          <div className="cmp-name">{previousCard.name}</div>
        </div>
        <div className="cmp-vs">vs</div>
        <div className="cmp-card">
          <div className="cmp-img">
            <CardImage
              cardImageLink={currentImage ?? undefined}
              alt={currentName}
              fill
              className="object-contain p-1"
              sizes="140px"
            />
          </div>
          <div className="cmp-name">{currentName}</div>
        </div>
      </div>

      <p className="cmp-prompt">See these two side by side?</p>

      <div className="cmp-actions">
        <Link href={compareHref} onClick={dismiss} className="cmp-btn cmp-btn-primary">
          Compare
        </Link>
        <button onClick={dismiss} className="cmp-btn cmp-btn-ghost">
          Not now
        </button>
      </div>
    </div>
  );
}
