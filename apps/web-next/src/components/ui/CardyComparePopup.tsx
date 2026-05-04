'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import CardyCharacter from './CardyCharacter';
import CardImage from './CardImage';

const VISITS_KEY = 'ccd_session_card_visits';
const DISMISSED_KEY = 'ccd_session_compare_popup_dismissed';

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
    // Move current card to the end (most recent), de-duped.
    const filtered = visits.filter(v => v.slug !== currentSlug);
    const updated = [...filtered, { slug: currentSlug, name: currentName, image: currentImage ?? null }].slice(-10);
    writeVisits(updated);

    if (sessionStorage.getItem(DISMISSED_KEY) === 'true') return;

    // Need at least one prior unique card to suggest a comparison.
    const priorUniques = filtered;
    if (priorUniques.length === 0) return;

    // Suggest the most recently visited prior card.
    const prev = priorUniques[priorUniques.length - 1];
    setPreviousCard(prev);

    // Small delay so it doesn't feel jarring on page load.
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, [currentSlug, currentName, currentImage]);

  const dismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // ignore
    }
  };

  if (!visible || !previousCard) return null;

  const compareHref = `/compare?cards=${previousCard.slug},${currentSlug}`;

  return (
    <div
      role="dialog"
      aria-label="Compare these cards"
      className="fixed bottom-4 right-4 z-40 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white shadow-2xl ring-1 ring-gray-200 p-4 animate-[cardy-pop_220ms_ease-out]"
      style={{
        // Keyframes inline so the component is self-contained.
        // Tailwind doesn't have a built-in pop animation that matches.
      }}
    >
      <style jsx>{`
        @keyframes cardy-pop {
          0% { opacity: 0; transform: translateY(12px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div className="flex items-center justify-center gap-2">
        <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
          <div className="relative w-full aspect-[1.6/1] max-w-[120px] bg-gray-50 rounded-md overflow-hidden ring-1 ring-gray-200">
            <CardImage
              cardImageLink={previousCard.image ?? undefined}
              alt={previousCard.name}
              fill
              className="object-contain p-1"
              sizes="120px"
            />
          </div>
          <div className="text-[11px] font-medium text-gray-700 text-center leading-tight line-clamp-2">
            {previousCard.name}
          </div>
        </div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">vs</div>
        <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
          <div className="relative w-full aspect-[1.6/1] max-w-[120px] bg-gray-50 rounded-md overflow-hidden ring-1 ring-gray-200">
            <CardImage
              cardImageLink={currentImage ?? undefined}
              alt={currentName}
              fill
              className="object-contain p-1"
              sizes="120px"
            />
          </div>
          <div className="text-[11px] font-medium text-gray-700 text-center leading-tight line-clamp-2">
            {currentName}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5">
          <CardyCharacter size="sm" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 leading-tight">
            Cardy says
          </p>
          <p className="text-sm text-gray-900 leading-snug">
            Compare these two side by side?
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Link
          href={compareHref}
          onClick={dismiss}
          className="flex-1 text-center rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-3 py-2 transition-colors"
        >
          Compare them
        </Link>
        <button
          onClick={dismiss}
          className="rounded-lg bg-white text-gray-700 text-sm font-medium px-3 py-2 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
