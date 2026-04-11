'use client';

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import CardImage from "@/components/ui/CardImage";
import { Card, CardBenefit, WalletCard, BenefitUsageRecord } from "@/lib/api";
import {
  CheckCircleIcon,
  GiftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
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

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getCurrentQuarter(): number {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

function getPeriodStart(frequency: string, year: number, quarter: number, monthIndex?: number): string {
  switch (frequency) {
    case 'monthly': {
      const m = monthIndex ?? ((quarter - 1) * 3);
      return `${year}-${String(m + 1).padStart(2, '0')}-01`;
    }
    case 'quarterly': {
      const qMonth = (quarter - 1) * 3;
      return `${year}-${String(qMonth + 1).padStart(2, '0')}-01`;
    }
    case 'semi_annual': {
      const hMonth = quarter <= 2 ? 0 : 6;
      return `${year}-${String(hMonth + 1).padStart(2, '0')}-01`;
    }
    case 'annual':
      return `${year}-01-01`;
    case 'multi_year':
      return '1970-01-01';
    default:
      return `${year}-01-01`;
  }
}

// All benefit values in YAML are annual totals, so quarterly portion is always value / 4
function getQuarterValue(benefit: CardBenefit): number {
  if (benefit.frequency === 'ongoing' || benefit.frequency === 'multi_year') return 0;
  return benefit.value / 4;
}

// Get the value a single period checkbox represents
function getPerPeriodValue(benefit: CardBenefit): number {
  switch (benefit.frequency) {
    case 'monthly': return Math.round(benefit.value / 12);
    case 'quarterly': return Math.round(benefit.value / 4);
    case 'semi_annual': return Math.round(benefit.value / 2);
    case 'annual': return benefit.value;
    case 'multi_year': return benefit.value;
    default: return 0;
  }
}

function getPeriodLabel(frequency: string, year: number, quarter: number, monthIndex?: number): string {
  switch (frequency) {
    case 'monthly':
      return monthNames[monthIndex ?? ((quarter - 1) * 3)];
    case 'quarterly':
      return `Q${quarter} ${year}`;
    case 'semi_annual':
      return quarter <= 2 ? `H1 ${year} (Jan–Jun)` : `H2 ${year} (Jul–Dec)`;
    case 'annual':
      return `${year}`;
    default:
      return '';
  }
}

interface TrackedBenefit {
  benefit: CardBenefit;
  cardId: number;
  cardName: string;
  cardSlug: string;
  cardImage?: string;
}

interface WalletBenefitsProps {
  walletCards: WalletCard[];
  allCards: Card[];
  usageRecords: BenefitUsageRecord[];
  onToggleUsage: (cardId: number, benefitName: string, frequency: string, periodStart: string, status: 'used' | 'dismissed') => Promise<void>;
  onRemoveUsage: (cardId: number, benefitName: string, periodStart: string) => Promise<void>;
}

export default function WalletBenefits({ walletCards, allCards, usageRecords, onToggleUsage, onRemoveUsage }: WalletBenefitsProps) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());
  const [confirmingUncheck, setConfirmingUncheck] = useState<string | null>(null);
  const [loadingToggle, setLoadingToggle] = useState<string | null>(null);
  const confirmTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimeout.current) clearTimeout(confirmTimeout.current);
    };
  }, []);

  // Build lookup map from usage records
  const usageLookup = useMemo(() => {
    const map = new Map<string, BenefitUsageRecord>();
    for (const record of usageRecords) {
      const key = `${record.card_id}-${record.benefit_name}-${record.period_start}`;
      map.set(key, record);
    }
    return map;
  }, [usageRecords]);

  // Match wallet cards to card data
  const cardsWithBenefits = useMemo(() => {
    const result: { walletCard: WalletCard; cardData: Card; benefits: CardBenefit[] }[] = [];
    for (const wc of walletCards) {
      const cardData = allCards.find(c => c.card_name === wc.card_name);
      if (cardData?.benefits && cardData.benefits.length > 0) {
        result.push({ walletCard: wc, cardData, benefits: cardData.benefits });
      }
    }
    return result;
  }, [walletCards, allCards]);

  // Trackable credits: value > 0, not ongoing
  const trackedBenefits = useMemo((): TrackedBenefit[] => {
    return cardsWithBenefits.flatMap(c =>
      c.benefits
        .filter(b => b.value > 0 && b.frequency !== 'ongoing')
        .map(b => ({
          benefit: b,
          cardId: c.walletCard.card_id,
          cardName: c.cardData.card_name,
          cardSlug: c.cardData.slug,
          cardImage: c.cardData.card_image_link,
        }))
    );
  }, [cardsWithBenefits]);

  const periodicBenefits = trackedBenefits.filter(t => t.benefit.frequency !== 'multi_year');
  const multiYearBenefits = trackedBenefits.filter(t => t.benefit.frequency === 'multi_year');

  // Perks (value === 0)
  const allPerks = useMemo(() => {
    return cardsWithBenefits.flatMap(c =>
      c.benefits.filter(b => b.value === 0).map(b => ({
        ...b,
        cardName: c.cardData.card_name,
        cardSlug: c.cardData.slug,
      }))
    );
  }, [cardsWithBenefits]);

  // Total annual value
  const totalAnnualValue = useMemo(() => {
    return trackedBenefits.reduce((sum, t) => {
      if (t.benefit.frequency === 'multi_year') return sum + Math.round(t.benefit.value / 4);
      return sum + t.benefit.value;
    }, 0);
  }, [trackedBenefits]);

  // Calculate quarter summary
  const quarterSummary = useMemo(() => {
    let available = 0;
    let used = 0;

    for (const t of periodicBenefits) {
      const { benefit, cardId } = t;
      const qValue = getQuarterValue(benefit);
      available += qValue;

      if (benefit.frequency === 'monthly') {
        const perMonth = benefit.value / 12;
        for (let i = 0; i < 3; i++) {
          const monthIdx = (selectedQuarter - 1) * 3 + i;
          const ps = getPeriodStart('monthly', selectedYear, selectedQuarter, monthIdx);
          const key = `${cardId}-${benefit.name}-${ps}`;
          if (usageLookup.has(key) && usageLookup.get(key)!.status === 'used') {
            used += perMonth;
          }
        }
      } else {
        const ps = getPeriodStart(benefit.frequency, selectedYear, selectedQuarter);
        const key = `${cardId}-${benefit.name}-${ps}`;
        if (usageLookup.has(key) && usageLookup.get(key)!.status === 'used') {
          used += qValue;
        }
      }
    }

    return { available: Math.round(available), used: Math.round(used) };
  }, [periodicBenefits, selectedYear, selectedQuarter, usageLookup]);

  // Calculate annual summary across all 4 quarters
  const annualSummary = useMemo(() => {
    let used = 0;

    for (const t of periodicBenefits) {
      const { benefit, cardId } = t;

      if (benefit.frequency === 'monthly') {
        const perMonth = benefit.value / 12;
        for (let q = 1; q <= 4; q++) {
          for (let i = 0; i < 3; i++) {
            const monthIdx = (q - 1) * 3 + i;
            const ps = getPeriodStart('monthly', selectedYear, q, monthIdx);
            const key = `${cardId}-${benefit.name}-${ps}`;
            if (usageLookup.has(key) && usageLookup.get(key)!.status === 'used') {
              used += perMonth;
            }
          }
        }
      } else if (benefit.frequency === 'quarterly') {
        const perQ = benefit.value / 4;
        for (let q = 1; q <= 4; q++) {
          const ps = getPeriodStart('quarterly', selectedYear, q);
          const key = `${cardId}-${benefit.name}-${ps}`;
          if (usageLookup.has(key) && usageLookup.get(key)!.status === 'used') {
            used += perQ;
          }
        }
      } else if (benefit.frequency === 'semi_annual') {
        const perHalf = benefit.value / 2;
        for (const q of [1, 3] as const) {
          const ps = getPeriodStart('semi_annual', selectedYear, q);
          const key = `${cardId}-${benefit.name}-${ps}`;
          if (usageLookup.has(key) && usageLookup.get(key)!.status === 'used') {
            used += perHalf;
          }
        }
      } else if (benefit.frequency === 'annual') {
        const ps = getPeriodStart('annual', selectedYear, 1);
        const key = `${cardId}-${benefit.name}-${ps}`;
        if (usageLookup.has(key) && usageLookup.get(key)!.status === 'used') {
          used += benefit.value;
        }
      }
    }

    return { available: totalAnnualValue, used: Math.round(used) };
  }, [periodicBenefits, selectedYear, totalAnnualValue, usageLookup]);

  const handleCheck = async (cardId: number, benefitName: string, frequency: string, periodStart: string, status: 'used' | 'dismissed' = 'used') => {
    const key = `${cardId}-${benefitName}-${periodStart}`;
    setLoadingToggle(key);
    try {
      await onToggleUsage(cardId, benefitName, frequency, periodStart, status);
    } finally {
      setLoadingToggle(null);
    }
  };

  const handleUncheck = async (cardId: number, benefitName: string, periodStart: string) => {
    const key = `${cardId}-${benefitName}-${periodStart}`;

    // If not already confirming, show confirmation
    if (confirmingUncheck !== key) {
      setConfirmingUncheck(key);
      if (confirmTimeout.current) clearTimeout(confirmTimeout.current);
      confirmTimeout.current = setTimeout(() => setConfirmingUncheck(null), 3000);
      return;
    }

    // Confirmed — uncheck
    setConfirmingUncheck(null);
    if (confirmTimeout.current) clearTimeout(confirmTimeout.current);
    setLoadingToggle(key);
    try {
      await onRemoveUsage(cardId, benefitName, periodStart);
    } finally {
      setLoadingToggle(null);
    }
  };

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

  const qPct = quarterSummary.available > 0 ? Math.round((quarterSummary.used / quarterSummary.available) * 100) : 0;
  const aPct = annualSummary.available > 0 ? Math.round((annualSummary.used / annualSummary.available) * 100) : 0;

  // Group periodic benefits by card
  const benefitsByCard = useMemo(() => {
    const map = new Map<number, { cardName: string; cardSlug: string; cardImage?: string; benefits: TrackedBenefit[] }>();
    for (const t of periodicBenefits) {
      if (!map.has(t.cardId)) {
        map.set(t.cardId, { cardName: t.cardName, cardSlug: t.cardSlug, cardImage: t.cardImage, benefits: [] });
      }
      map.get(t.cardId)!.benefits.push(t);
    }
    return Array.from(map.entries());
  }, [periodicBenefits]);

  const renderCheckbox = (cardId: number, benefit: CardBenefit, periodStart: string, label: string) => {
    const key = `${cardId}-${benefit.name}-${periodStart}`;
    const record = usageLookup.get(key);
    const isUsed = record?.status === 'used';
    const isLoading = loadingToggle === key;
    const isConfirming = confirmingUncheck === key;

    return (
      <div key={key} className="relative inline-flex items-center gap-1.5">
        <button
          disabled={isLoading}
          onClick={() => isUsed ? handleUncheck(cardId, benefit.name, periodStart) : handleCheck(cardId, benefit.name, benefit.frequency, periodStart)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isUsed
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
          } ${isLoading ? 'opacity-50' : ''}`}
        >
          {isLoading ? (
            <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : isUsed ? (
            <CheckCircleIcon className="h-3.5 w-3.5" />
          ) : (
            <div className="h-3.5 w-3.5 rounded-full border-2 border-gray-300" />
          )}
          {label}
        </button>
        {isConfirming && (
          <div className="absolute top-full left-0 mt-1 z-10 bg-white rounded-lg shadow-lg border border-gray-200 px-3 py-2 whitespace-nowrap">
            <p className="text-xs text-gray-600 mb-1.5">Unmark this?</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleUncheck(cardId, benefit.name, periodStart)}
                className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmingUncheck(null)}
                className="text-xs px-2 py-0.5 bg-gray-50 text-gray-600 rounded hover:bg-gray-100"
              >
                No
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="bg-gradient-to-br from-emerald-50 to-white shadow rounded-lg p-6 border border-emerald-100">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Benefits Tracker</h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-indigo-100 text-indigo-700 border border-indigo-200">Experimental</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {cardsWithBenefits.length} {cardsWithBenefits.length === 1 ? 'card' : 'cards'} · ${totalAnnualValue.toLocaleString()}/yr in credits
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Quarter */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Q{selectedQuarter} {selectedYear}</p>
              <p className="text-sm text-gray-400">{qPct}%</p>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${qPct}%` }} />
            </div>
            <p className="text-lg font-bold text-emerald-700">${quarterSummary.used} <span className="text-sm font-normal text-gray-400">of ${quarterSummary.available}</span></p>
          </div>
          {/* Annual */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{selectedYear} Annual</p>
              <p className="text-sm text-gray-400">{aPct}%</p>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${aPct}%` }} />
            </div>
            <p className="text-lg font-bold text-indigo-700">${annualSummary.used} <span className="text-sm font-normal text-gray-400">of ${annualSummary.available}</span></p>
          </div>
        </div>
      </div>

      {/* Quarter/Year Navigation */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setSelectedYear(selectedYear - 1)}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {[1, 2, 3, 4].map(q => (
            <button
              key={q}
              onClick={() => setSelectedQuarter(q)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                selectedQuarter === q
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Q{q}
            </button>
          ))}
        </div>
        <span className="text-sm font-medium text-gray-700 mx-1">{selectedYear}</span>
        <button
          onClick={() => setSelectedYear(selectedYear + 1)}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Benefits by Card */}
      {benefitsByCard.length > 0 ? (
        <div className="space-y-4">
          {benefitsByCard.map(([cardId, card]) => (
            <div key={cardId} className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-4 py-3 sm:px-5 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <Link href={`/card/${card.cardSlug}`}>
                    <CardImage cardImageLink={card.cardImage} alt={card.cardName} width={48} height={30} className="rounded object-contain flex-shrink-0" sizes="48px" />
                  </Link>
                  <Link href={`/card/${card.cardSlug}`} className="text-sm font-semibold text-gray-900 hover:text-indigo-600 truncate">
                    {card.cardName}
                  </Link>
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {card.benefits.map((t) => {
                  const { benefit } = t;
                  return (
                    <div key={`${cardId}-${benefit.name}`} className="px-4 py-3 sm:px-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base flex-shrink-0">{categoryIcons[benefit.category] || categoryIcons.other}</span>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-gray-900">{benefit.name}</span>
                            {benefit.enrollment_required && (
                              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
                                Enroll
                              </span>
                            )}
                            <p className="text-xs text-gray-400 truncate">{benefit.description}</p>
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1 flex-shrink-0">
                          <span className="text-sm font-bold text-emerald-700">${getPerPeriodValue(benefit)}</span>
                          <span className="text-xs text-gray-400">{frequencyLabels[benefit.frequency]}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {benefit.frequency === 'monthly' && (
                          <>
                            {[0, 1, 2].map(i => {
                              const monthIdx = (selectedQuarter - 1) * 3 + i;
                              const ps = getPeriodStart('monthly', selectedYear, selectedQuarter, monthIdx);
                              return renderCheckbox(cardId, benefit, ps, monthNames[monthIdx]);
                            })}
                          </>
                        )}
                        {benefit.frequency === 'quarterly' && (
                          renderCheckbox(cardId, benefit, getPeriodStart('quarterly', selectedYear, selectedQuarter), `Q${selectedQuarter}`)
                        )}
                        {benefit.frequency === 'semi_annual' && (
                          renderCheckbox(
                            cardId, benefit,
                            getPeriodStart('semi_annual', selectedYear, selectedQuarter),
                            getPeriodLabel('semi_annual', selectedYear, selectedQuarter)
                          )
                        )}
                        {benefit.frequency === 'annual' && (
                          renderCheckbox(cardId, benefit, getPeriodStart('annual', selectedYear, selectedQuarter), `${selectedYear}`)
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
          No trackable credits for this quarter.
        </div>
      )}

      {/* One-Time Credits (multi_year) */}
      {multiYearBenefits.length > 0 && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-3 sm:px-5 border-b border-gray-100">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">One-Time Credits</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {multiYearBenefits.map(t => {
              const { benefit, cardId, cardName, cardSlug, cardImage } = t;
              const ps = '1970-01-01';
              const key = `${cardId}-${benefit.name}-${ps}`;
              const record = usageLookup.get(key);
              const isLoading = loadingToggle === key;

              return (
                <div key={key} className="px-4 py-3 sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-base flex-shrink-0">{categoryIcons[benefit.category] || categoryIcons.other}</span>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-gray-900">{benefit.name}</span>
                        <p className="text-xs text-gray-400 truncate">{benefit.description}</p>
                        <Link href={`/card/${cardSlug}`} className="text-xs text-indigo-600 hover:text-indigo-800">
                          {cardName}
                        </Link>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-bold text-emerald-700 mr-2">${benefit.value}</span>
                      <button
                        disabled={isLoading}
                        onClick={() => record?.status === 'used'
                          ? onRemoveUsage(cardId, benefit.name, ps)
                          : handleCheck(cardId, benefit.name, benefit.frequency, ps, 'used')
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          record?.status === 'used'
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                        } ${isLoading ? 'opacity-50' : ''}`}
                      >
                        Used
                      </button>
                      <button
                        disabled={isLoading}
                        onClick={() => record?.status === 'dismissed'
                          ? onRemoveUsage(cardId, benefit.name, ps)
                          : handleCheck(cardId, benefit.name, benefit.frequency, ps, 'dismissed')
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          record?.status === 'dismissed'
                            ? 'bg-gray-200 text-gray-700 border border-gray-300'
                            : 'bg-gray-50 text-gray-400 border border-gray-200 hover:bg-gray-100'
                        } ${isLoading ? 'opacity-50' : ''}`}
                      >
                        Not interested
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Perks */}
      {allPerks.length > 0 && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-3 sm:px-5 border-b border-gray-100">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Additional Perks</h3>
          </div>
          <div className="p-4 sm:p-5">
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
        </div>
      )}

      {/* Community feedback note */}
      <p className="text-xs text-gray-400 text-center">
        Benefits data is community-maintained and may not be fully up to date.{" "}
        See something wrong?{" "}
        <a
          href="https://github.com/CreditOdds/creditodds/issues/new?title=%5BBenefits%5D%20Incorrect%20or%20missing%20benefit&body=Card%3A%20%0A%0AWhat%20needs%20to%20be%20corrected%3F%0A%0A&labels=benefits"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-600 hover:text-emerald-700 underline underline-offset-2"
        >
          Let us know on GitHub
        </a>
        .
      </p>
    </div>
  );
}
