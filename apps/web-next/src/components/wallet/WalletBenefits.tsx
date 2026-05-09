'use client';

import { useMemo } from "react";
import Link from "next/link";
import CardImage from "@/components/ui/CardImage";
import { Card, CardBenefit, WalletCard } from "@/lib/api";
import { amortizedAnnualValue, cadenceLabel, formatBenefitValue, isMonetaryBenefit } from "@/lib/cardDisplayUtils";
import { dedupeWalletByCardName } from "@/app/profile/profileSelectors";

interface CardWithBenefits {
  walletCard: WalletCard;
  cardData: Card;
  benefits: CardBenefit[];
}

interface WalletBenefitsProps {
  walletCards: WalletCard[];
  allCards: Card[];
}

interface DecoratedBenefit extends CardBenefit {
  cardName: string;
  cardSlug: string;
  cardImage?: string;
}

export default function WalletBenefits({ walletCards, allCards }: WalletBenefitsProps) {
  const cardsWithBenefits = useMemo(() => {
    // Dedupe by card_name — holding two of the same card doesn't double its credits.
    const uniqueWalletCards = dedupeWalletByCardName(walletCards);
    const result: CardWithBenefits[] = [];
    for (const wc of uniqueWalletCards) {
      const cardData = allCards.find(c => c.card_name === wc.card_name);
      if (cardData?.benefits && cardData.benefits.length > 0) {
        result.push({ walletCard: wc, cardData, benefits: cardData.benefits });
      }
    }
    return result;
  }, [walletCards, allCards]);

  const allCredits = useMemo<DecoratedBenefit[]>(() => {
    return cardsWithBenefits.flatMap(c =>
      c.benefits
        .filter(b => b.value > 0)
        .map(b => ({ ...b, cardName: c.cardData.card_name, cardSlug: c.cardData.slug, cardImage: c.cardData.card_image_link }))
    ).sort((a, b) => amortizedAnnualValue(b) - amortizedAnnualValue(a));
  }, [cardsWithBenefits]);

  const allPerks = useMemo<DecoratedBenefit[]>(() => {
    return cardsWithBenefits.flatMap(c =>
      c.benefits
        .filter(b => b.value === 0)
        .map(b => ({ ...b, cardName: c.cardData.card_name, cardSlug: c.cardData.slug, cardImage: c.cardData.card_image_link }))
    );
  }, [cardsWithBenefits]);

  const totalAnnualValue = useMemo(
    () => Math.round(allCredits.reduce((sum, b) => sum + amortizedAnnualValue(b), 0)),
    [allCredits]
  );

  const enrollCount = useMemo(() => allCredits.filter(b => b.enrollment_required).length, [allCredits]);

  if (cardsWithBenefits.length === 0) {
    return (
      <div className="cj-verdict">
        <b>No cards with benefits yet.</b> Add premium cards to your wallet to see their credits and perks here.
      </div>
    );
  }

  return (
    <section className="cj-section">
      <div className="cj-readoff" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="cj-readoff-cell cj-readoff-bonus">
          <div className="cj-readoff-k">Total annual credits</div>
          <div className="cj-readoff-v">${totalAnnualValue.toLocaleString()}</div>
          <div className="cj-readoff-foot">
            across {cardsWithBenefits.length} card{cardsWithBenefits.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="cj-readoff-cell">
          <div className="cj-readoff-k">Statement credits</div>
          <div className="cj-readoff-v">{allCredits.length}</div>
          <div className="cj-readoff-foot">
            {enrollCount > 0 ? `${enrollCount} require enrollment` : 'no enrollment needed'}
          </div>
        </div>
        <div className="cj-readoff-cell">
          <div className="cj-readoff-k">Additional perks</div>
          <div className="cj-readoff-v">{allPerks.length}</div>
          <div className="cj-readoff-foot">lounges, status, etc.</div>
        </div>
      </div>

      {allCredits.length > 0 && (
        <>
          <div className="cj-table-label" style={{ marginTop: 24 }}>Statement credits</div>
          <div className="cj-tape cj-tape-credits">
            <div className="cj-tape-head">
              <div></div>
              <div>Credit</div>
              <div>Cadence</div>
              <div className="cj-tape-res">Value</div>
            </div>
            {allCredits.map((b, i) => {
              const cadence = cadenceLabel(b);
              const annual = amortizedAnnualValue(b);
              const isMultiYear = b.frequency === 'multi_year';
              const showAmortized = isMultiYear && isMonetaryBenefit(b) && annual > 0;
              return (
                <Link
                  key={`${b.cardName}-${b.name}-${i}`}
                  href={`/card/${b.cardSlug}`}
                  className="cj-tape-row"
                >
                  <div>
                    <span className="cj-tape-thumb">
                      <CardImage cardImageLink={b.cardImage} alt={b.cardName} fill sizes="36px" className="object-contain" />
                    </span>
                  </div>
                  <div className="cj-tape-event">
                    <span className="cj-tape-field">{b.name}</span>
                    <div className="cj-tape-detail">
                      {b.cardName}
                      {b.enrollment_required ? ' · enrollment required' : ''}
                    </div>
                    <div className="cj-tape-detail cj-mob-only">{cadence}</div>
                  </div>
                  <div className="cj-tape-when">{cadence}</div>
                  <div className="cj-tape-res">
                    <b>{formatBenefitValue(b)}</b>
                    {showAmortized && (
                      <div className="cj-tape-detail">~${annual.toLocaleString()}/yr</div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {allPerks.length > 0 && (
        <>
          <div className="cj-table-label" style={{ marginTop: 24 }}>Additional perks</div>
          <div className="cj-tape">
            {allPerks.map((p, i) => (
              <Link
                key={`${p.cardName}-${p.name}-${i}`}
                href={`/card/${p.cardSlug}`}
                className="cj-tape-row cj-tape-row-perk"
              >
                <div>
                  <span className="cj-tape-thumb">
                    <CardImage cardImageLink={p.cardImage} alt={p.cardName} fill sizes="36px" className="object-contain" />
                  </span>
                </div>
                <div className="cj-tape-event">
                  <span className="cj-tape-field">{p.name}</span>
                  <div className="cj-tape-detail">{p.cardName}</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
