'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import CardImage from "@/components/ui/CardImage";
import { Card, CardBenefit, WalletCard } from "@/lib/api";
import {
  CheckCircleIcon,
  GiftIcon,
} from "@heroicons/react/24/outline";

const frequencyLabels: Record<string, string> = {
  monthly: "/mo",
  quarterly: "/qtr",
  semi_annual: "/6 mo",
  annual: "/yr",
  multi_year: "every 4 yr",
  ongoing: "",
};

const categoryIcons: Record<string, string> = {
  dining: "🍽️",
  dining_travel: "🚗",
  travel: "✈️",
  hotel: "🏨",
  entertainment: "🎬",
  shopping: "🛍️",
  fitness: "💪",
  lounge: "🛋️",
  security: "🔒",
  gas: "⛽",
  streaming: "📺",
  grocery: "🛒",
  rideshare: "🚗",
  other: "✨",
};

interface CardWithBenefits {
  walletCard: WalletCard;
  cardData: Card;
  benefits: CardBenefit[];
}

interface WalletBenefitsProps {
  walletCards: WalletCard[];
  allCards: Card[];
}

export default function WalletBenefits({ walletCards, allCards }: WalletBenefitsProps) {
  const [viewMode, setViewMode] = useState<'by-card' | 'all-credits'>('all-credits');

  const cardsWithBenefits = useMemo(() => {
    const result: CardWithBenefits[] = [];
    for (const wc of walletCards) {
      const cardData = allCards.find(c => c.card_name === wc.card_name);
      if (cardData?.benefits && cardData.benefits.length > 0) {
        result.push({ walletCard: wc, cardData, benefits: cardData.benefits });
      }
    }
    return result;
  }, [walletCards, allCards]);

  const allCredits = useMemo(() => {
    return cardsWithBenefits.flatMap(c =>
      c.benefits.filter(b => b.value > 0).map(b => ({ ...b, cardName: c.cardData.card_name, cardSlug: c.cardData.slug, cardImage: c.cardData.card_image_link }))
    ).sort((a, b) => b.value - a.value);
  }, [cardsWithBenefits]);

  const allPerks = useMemo(() => {
    return cardsWithBenefits.flatMap(c =>
      c.benefits.filter(b => b.value === 0).map(b => ({ ...b, cardName: c.cardData.card_name, cardSlug: c.cardData.slug, cardImage: c.cardData.card_image_link }))
    );
  }, [cardsWithBenefits]);

  const totalAnnualValue = useMemo(() => {
    return allCredits.reduce((sum, b) => {
      if (b.frequency === "multi_year") return sum + Math.round(b.value / 4);
      return sum + b.value;
    }, 0);
  }, [allCredits]);

  if (cardsWithBenefits.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center py-12">
          <GiftIcon className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-gray-500">No cards with benefits in your wallet yet.</p>
          <p className="mt-1 text-sm text-gray-400">Add premium cards to see their credits and perks here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="bg-gradient-to-br from-emerald-50 to-white shadow rounded-lg p-6 border border-emerald-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Your Card Benefits</h2>
            <p className="mt-1 text-sm text-gray-500">
              Credits and perks from {cardsWithBenefits.length} {cardsWithBenefits.length === 1 ? 'card' : 'cards'} in your wallet
            </p>
          </div>
          <div className="text-center sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Total Annual Credits</p>
            <p className="text-3xl font-extrabold text-emerald-700">${totalAnnualValue.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('all-credits')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md ${
            viewMode === 'all-credits'
              ? 'bg-indigo-100 text-indigo-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All Credits
        </button>
        <button
          onClick={() => setViewMode('by-card')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md ${
            viewMode === 'by-card'
              ? 'bg-indigo-100 text-indigo-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          By Card
        </button>
      </div>

      {viewMode === 'all-credits' ? (
        <div className="bg-white shadow rounded-lg divide-y divide-gray-100">
          {/* Credits Table */}
          <div className="p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">Statement Credits</h3>
            <div className="space-y-3">
              {allCredits.map((credit, i) => (
                <div key={`${credit.cardName}-${credit.name}-${i}`} className="flex items-center gap-4 rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3">
                  <span className="text-xl flex-shrink-0">{categoryIcons[credit.category] || categoryIcons.other}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{credit.name}</p>
                    <p className="text-xs text-gray-500 truncate">{credit.description}</p>
                  </div>
                  <Link href={`/card/${credit.cardSlug}`} className="hidden sm:block flex-shrink-0">
                    <CardImage cardImageLink={credit.cardImage} alt={credit.cardName} width={48} height={30} className="rounded object-contain" sizes="48px" />
                  </Link>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-emerald-700">${credit.value}</p>
                    <p className="text-xs text-gray-400">{frequencyLabels[credit.frequency]}</p>
                  </div>
                  {credit.enrollment_required && (
                    <span className="hidden sm:inline-flex flex-shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
                      Enroll
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Perks */}
          {allPerks.length > 0 && (
            <div className="p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">Additional Perks</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {allPerks.map((perk, i) => (
                  <div key={`${perk.cardName}-${perk.name}-${i}`} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3">
                    <CheckCircleIcon className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{perk.name}</p>
                      <p className="text-xs text-gray-500">{perk.description}</p>
                      <Link href={`/card/${perk.cardSlug}`} className="text-xs text-indigo-600 hover:text-indigo-800 mt-1 inline-block">
                        {perk.cardName}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* By Card View */
        <div className="space-y-4">
          {cardsWithBenefits.map(({ walletCard, cardData, benefits }) => {
            const credits = benefits.filter(b => b.value > 0);
            const perks = benefits.filter(b => b.value === 0);
            const cardTotal = credits.reduce((sum, b) => {
              if (b.frequency === "multi_year") return sum + Math.round(b.value / 4);
              return sum + b.value;
            }, 0);

            return (
              <div key={walletCard.id} className="bg-white shadow rounded-lg overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex items-center gap-4">
                    <Link href={`/card/${cardData.slug}`}>
                      <CardImage cardImageLink={cardData.card_image_link} alt={cardData.card_name} width={64} height={40} className="rounded object-contain flex-shrink-0" sizes="64px" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/card/${cardData.slug}`} className="text-sm font-semibold text-gray-900 hover:text-indigo-600 truncate block">
                        {cardData.card_name}
                      </Link>
                      <p className="text-xs text-gray-500">{cardData.bank}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-emerald-700">${cardTotal.toLocaleString()}</p>
                      <p className="text-xs text-gray-400">/yr in credits</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 sm:p-5">
                  {credits.length > 0 && (
                    <div className="space-y-2">
                      {credits.map((b, i) => (
                        <div key={i} className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base flex-shrink-0">{categoryIcons[b.category] || categoryIcons.other}</span>
                            <span className="text-sm text-gray-700 truncate">{b.name}</span>
                            {b.enrollment_required && (
                              <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
                                Enroll
                              </span>
                            )}
                          </div>
                          <div className="flex items-baseline gap-1 flex-shrink-0">
                            <span className="text-sm font-bold text-emerald-700">${b.value}</span>
                            <span className="text-xs text-gray-400">{frequencyLabels[b.frequency]}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {perks.length > 0 && (
                    <div className={credits.length > 0 ? "mt-3 pt-3 border-t border-gray-100" : ""}>
                      <div className="flex flex-wrap gap-2">
                        {perks.map((p, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-600">
                            <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />
                            {p.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
