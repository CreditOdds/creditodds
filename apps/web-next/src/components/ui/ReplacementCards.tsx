'use client';

import Link from 'next/link';
import posthog from 'posthog-js';
import CardImage from '@/components/ui/CardImage';
import type { ReplacementCardInfo } from '@/lib/api';

/**
 * Which page the rail is rendered on. Both surfaces emit the same
 * `replacement_card_clicked` event, so this is what lets the two be read apart
 * in PostHog — without it the card-page clicks would silently pollute the
 * per-article readout the news rail has been measured on since #1924.
 */
export type ReplacementSurface = 'news' | 'card_page';

interface Props {
  cards: ReplacementCardInfo[];
  surface: ReplacementSurface;
  /**
   * What drove the click: the article id on news, the dead card's slug on a
   * card page. Emitted under a per-surface property name so the existing
   * `article_id` breakdown keeps meaning exactly what it always meant.
   */
  sourceId: string;
  /** Optional override; each surface has a different natural lead-in. */
  intro?: string;
  /**
   * DOM id for in-page links. Only the card page sets it, so the news markup
   * is unchanged and no id can ever collide across the two surfaces.
   */
  anchorId?: string;
}

function feeLabel(annualFee: number | null): string | null {
  if (annualFee === null) return null;
  return annualFee === 0 ? 'No annual fee' : `$${annualFee.toLocaleString('en-US')} annual fee`;
}

export function ReplacementCards({ cards, surface, sourceId, intro, anchorId }: Props) {
  if (!cards || cards.length === 0) return null;

  // The intro deliberately names no card. On a straight pull the article's
  // subject card is the dead one, but on a conversion story (Kroger to Smartly)
  // card_slug points at the live replacement, so naming the subject would
  // assert the opposite of the truth on half the articles that use this module.
  return (
    <aside id={anchorId} className="replacement-cards" aria-labelledby="replacement-cards-title">
      <h2 id="replacement-cards-title" className="replacement-cards-title">
        What to get instead
      </h2>
      <p className="replacement-cards-intro">
        {intro ?? 'These cards are open to new applicants and cover the same ground:'}
      </p>
      <ul className="replacement-cards-list">
        {cards.map((card, index) => {
          const fee = feeLabel(card.annual_fee);
          return (
            <li key={card.slug}>
              <Link
                href={`/card/${card.slug}`}
                className="replacement-card"
                onClick={() => {
                  posthog.capture('replacement_card_clicked', {
                    surface,
                    ...(surface === 'news'
                      ? { article_id: sourceId }
                      : { source_card_slug: sourceId }),
                    card_slug: card.slug,
                    card_name: card.name,
                    bank: card.bank,
                    position: index + 1,
                  });
                }}
              >
                <span className="replacement-card-thumb">
                  <CardImage
                    cardImageLink={card.image}
                    alt={card.name}
                    fill
                    sizes="72px"
                    style={{ objectFit: 'contain' }}
                  />
                </span>
                <span className="replacement-card-body">
                  <span className="replacement-card-name">{card.name}</span>
                  <span className="replacement-card-meta">
                    {card.bank}
                    {fee && (
                      <>
                        <span aria-hidden="true"> · </span>
                        {fee}
                      </>
                    )}
                  </span>
                  {card.reason && (
                    <span className="replacement-card-reason">{card.reason}</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
