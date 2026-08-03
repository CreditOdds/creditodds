'use client';

import Link from 'next/link';
import posthog from 'posthog-js';
import CardImage from '@/components/ui/CardImage';
import type { ReplacementCardInfo } from '@/lib/news';

interface Props {
  cards: ReplacementCardInfo[];
  /** Article id, so clicks can be attributed to the story that drove them. */
  articleId: string;
}

function feeLabel(annualFee: number | null): string | null {
  if (annualFee === null) return null;
  return annualFee === 0 ? 'No annual fee' : `$${annualFee.toLocaleString('en-US')} annual fee`;
}

export function ReplacementCards({ cards, articleId }: Props) {
  if (!cards || cards.length === 0) return null;

  // The intro deliberately names no card. On a straight pull the article's
  // subject card is the dead one, but on a conversion story (Kroger to Smartly)
  // card_slug points at the live replacement, so naming the subject would
  // assert the opposite of the truth on half the articles that use this module.
  return (
    <aside className="replacement-cards" aria-labelledby="replacement-cards-title">
      <h2 id="replacement-cards-title" className="replacement-cards-title">
        What to get instead
      </h2>
      <p className="replacement-cards-intro">
        These cards are open to new applicants and cover the same ground:
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
                    article_id: articleId,
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
