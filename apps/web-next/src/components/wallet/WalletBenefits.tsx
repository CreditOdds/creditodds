'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import CardImage from "@/components/ui/CardImage";
import { Card, CardBenefit, WalletCard } from "@/lib/api";
import {
  amortizedAnnualValue,
  DEFAULT_MULTI_YEAR_CYCLE,
  formatBenefitValue,
  isMonetaryBenefit,
} from "@/lib/cardDisplayUtils";
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

type GroupBy = 'value' | 'card';

// "$15/mo", "$200/yr", "$200 / 5 yr" — combines value and cadence into one
// scannable column. Multi-year reads as `$amount / N yr` rather than
// frequencyLabel's "every N yr" because we're pairing it with a dollar
// amount, not appending it inline.
function formatValueWithCadence(b: CardBenefit): string {
  const v = formatBenefitValue(b);
  switch (b.frequency) {
    case 'monthly': return `${v}/mo`;
    case 'quarterly': return `${v}/qtr`;
    case 'semi_annual': return `${v} / 6 mo`;
    case 'annual': return `${v}/yr`;
    case 'multi_year': {
      const years = b.frequency_years || DEFAULT_MULTI_YEAR_CYCLE;
      return `${v} / ${years} yr`;
    }
    case 'ongoing': return v;
    default: return v;
  }
}

function BenefitRow({ b }: { b: DecoratedBenefit }) {
  const annual = amortizedAnnualValue(b);
  const isMultiYear = b.frequency === 'multi_year';
  const showAmortized = isMultiYear && isMonetaryBenefit(b) && annual > 0;
  return (
    <Link
      href={`/card/${b.cardSlug}`}
      className="cj-tape-row"
    >
      <div>
        <span className="cj-tape-thumb">
          <CardImage cardImageLink={b.cardImage} alt={b.cardName} fill sizes="36px" className="object-contain" />
        </span>
      </div>
      <div className="cj-tape-event">
        <span className="cj-tape-field">
          {b.name}
          {b.enrollment_required && (
            <span className="cj-pill cj-pill-enroll" style={{ marginLeft: 8 }}>enrollment required</span>
          )}
        </span>
        <div className="cj-tape-detail">{b.cardName}</div>
      </div>
      <div className="cj-tape-res">
        <b>{formatValueWithCadence(b)}</b>
        {showAmortized && (
          <div className="cj-tape-detail">~${annual.toLocaleString()}/yr</div>
        )}
      </div>
    </Link>
  );
}

function PerkRow({ p }: { p: DecoratedBenefit }) {
  return (
    <Link
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
  );
}

export default function WalletBenefits({ walletCards, allCards }: WalletBenefitsProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>('value');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  // For grouped view: per-card breakdown sorted by total annual value.
  const cardGroups = useMemo(() => {
    return cardsWithBenefits
      .map(c => {
        const decorate = (b: CardBenefit): DecoratedBenefit => ({
          ...b,
          cardName: c.cardData.card_name,
          cardSlug: c.cardData.slug,
          cardImage: c.cardData.card_image_link,
        });
        const credits = c.benefits.filter(b => b.value > 0).map(decorate)
          .sort((a, b) => amortizedAnnualValue(b) - amortizedAnnualValue(a));
        const perks = c.benefits.filter(b => b.value === 0).map(decorate);
        const annualTotal = Math.round(credits.reduce((s, b) => s + amortizedAnnualValue(b), 0));
        return { card: c.cardData, credits, perks, annualTotal };
      })
      .sort((a, b) => b.annualTotal - a.annualTotal);
  }, [cardsWithBenefits]);

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

      <div className="cj-benefits-toolbar">
        <div className="cj-benefits-groupby" role="tablist" aria-label="Group benefits by">
          <button
            type="button"
            role="tab"
            aria-selected={groupBy === 'value'}
            className={'cj-benefits-tab' + (groupBy === 'value' ? ' active' : '')}
            onClick={() => setGroupBy('value')}
          >
            By value
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={groupBy === 'card'}
            className={'cj-benefits-tab' + (groupBy === 'card' ? ' active' : '')}
            onClick={() => setGroupBy('card')}
          >
            By card
          </button>
        </div>
      </div>

      {groupBy === 'value' && (
        <>
          {allCredits.length > 0 && (
            <>
              <div className="cj-table-label" style={{ marginTop: 16 }}>Statement credits</div>
              <div className="cj-tape cj-tape-credits">
                <div className="cj-tape-head">
                  <div></div>
                  <div>Credit</div>
                  <div className="cj-tape-res">Value</div>
                </div>
                {allCredits.map((b, i) => (
                  <BenefitRow key={`${b.cardName}-${b.name}-${i}`} b={b} />
                ))}
              </div>
            </>
          )}

          {allPerks.length > 0 && (
            <>
              <div className="cj-table-label" style={{ marginTop: 24 }}>Additional perks</div>
              <div className="cj-tape">
                {allPerks.map((p, i) => (
                  <PerkRow key={`${p.cardName}-${p.name}-${i}`} p={p} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {groupBy === 'card' && (
        <div className="cj-benefits-by-card">
          {cardGroups.map(g => {
            const expanded = !collapsed[g.card.slug];
            return (
              <div key={g.card.slug} className="cj-benefits-card-group">
                <button
                  type="button"
                  className="cj-benefits-card-header"
                  aria-expanded={expanded}
                  onClick={() => setCollapsed(s => ({ ...s, [g.card.slug]: expanded }))}
                >
                  <span className={'cj-benefits-chevron' + (expanded ? ' open' : '')} aria-hidden="true">▸</span>
                  <span className="cj-tape-thumb cj-benefits-card-thumb">
                    <CardImage cardImageLink={g.card.card_image_link} alt={g.card.card_name} fill sizes="56px" className="object-contain" />
                  </span>
                  <div className="cj-benefits-card-meta">
                    <div className="cj-benefits-card-name">{g.card.card_name}</div>
                    <div className="cj-benefits-card-sub">
                      {g.credits.length} credit{g.credits.length === 1 ? '' : 's'}
                      {g.perks.length > 0 ? ` · ${g.perks.length} perk${g.perks.length === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                  {g.annualTotal > 0 && (
                    <div className="cj-benefits-card-total">
                      <div className="cj-benefits-card-total-v">${g.annualTotal.toLocaleString()}</div>
                      <div className="cj-benefits-card-total-k">/ yr</div>
                    </div>
                  )}
                </button>
                {expanded && g.credits.length > 0 && (
                  <div className="cj-tape cj-tape-credits">
                    {g.credits.map((b, i) => (
                      <BenefitRow key={`${b.cardName}-${b.name}-${i}`} b={b} />
                    ))}
                  </div>
                )}
                {expanded && g.perks.length > 0 && (
                  <div className="cj-tape">
                    {g.perks.map((p, i) => (
                      <PerkRow key={`${p.cardName}-${p.name}-${i}`} p={p} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
