'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import Downshift from 'downshift';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ScaleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { Card, Reward, trackCardCompareEvent } from '@/lib/api';
import { amortizedAnnualValue, formatBenefitValue } from '@/lib/cardDisplayUtils';
import { cardMatchesSearch } from '@/lib/searchAliases';
import {
  categoryLabels,
  CategoryIcon,
  formatBonusValue,
  formatEstimatedValue,
  formatBonusRequirement,
  formatAnnualFee,
  formatRewardWithUsdEquivalent,
  formatRewardCapCaveat,
  getRewardUsdRate,
  RewardTypeBadge,
} from '@/lib/cardDisplayUtils';

interface CompareClientProps {
  allCards: Card[];
}

function CardPicker({
  allCards,
  selectedCard,
  excludeSlugs,
  onSelect,
  onClear,
  slotIndex,
}: {
  allCards: Card[];
  selectedCard: Card | null;
  excludeSlugs: string[];
  onSelect: (card: Card) => void;
  onClear: () => void;
  slotIndex: number;
}) {
  const [inputValue, setInputValue] = useState('');

  if (selectedCard) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-3">
        <div className="flex-shrink-0 h-10 w-16 relative">
          <CardImage
            cardImageLink={selectedCard.card_image_link}
            alt={selectedCard.card_name}
            fill
            className="object-contain rounded"
            sizes="64px"
          />
        </div>
        <div className="flex-1 min-w-0">
          <Link href={`/card/${selectedCard.slug}`} className="text-sm font-semibold text-gray-900 hover:text-indigo-600 truncate block">
            {selectedCard.card_name}
          </Link>
          <p className="text-xs text-gray-500 truncate">{selectedCard.bank}</p>
        </div>
        <button
          onClick={onClear}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label={`Remove ${selectedCard.card_name}`}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
    );
  }

  const filteredCards = allCards
    .filter((item) => {
      if (excludeSlugs.includes(item.slug)) return false;
      return cardMatchesSearch(item.card_name, item.bank, inputValue || '');
    })
    .sort((a, b) => {
      if (a.accepting_applications !== b.accepting_applications) {
        return a.accepting_applications ? -1 : 1;
      }
      const aIsBusiness = /business/i.test(a.card_name);
      const bIsBusiness = /business/i.test(b.card_name);
      if (aIsBusiness !== bIsBusiness) {
        return aIsBusiness ? 1 : -1;
      }
      return 0;
    });

  return (
    <Downshift<Card>
      id={`compare-picker-${slotIndex}`}
      onChange={(selection) => {
        if (selection) {
          onSelect(selection);
          setInputValue('');
        }
      }}
      inputValue={inputValue}
      itemToString={(item) => (item ? item.card_name : '')}
      selectedItem={null}
    >
      {({
        getInputProps,
        getItemProps,
        getMenuProps,
        isOpen,
        highlightedIndex,
        getRootProps,
      }) => (
        <div className="relative">
          <div {...getRootProps({}, { suppressRefError: true })}>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
              </div>
              <input
                {...getInputProps({
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value),
                })}
                className="block w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                placeholder={`Card ${slotIndex + 1}...`}
                type="search"
                autoComplete="off"
              />
            </div>
            <ul
              {...getMenuProps()}
              className={`absolute z-20 mt-1 w-full bg-white shadow-lg max-h-60 rounded-lg py-1 text-sm ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none ${
                isOpen && inputValue && filteredCards.length > 0 ? '' : 'hidden'
              }`}
            >
              {filteredCards.slice(0, 20).map((item, index) => {
                const isArchived = !item.accepting_applications;
                return (
                  <li
                    key={item.slug}
                    className={`cursor-pointer select-none relative py-2 pl-3 pr-4 ${
                      highlightedIndex === index
                        ? 'bg-indigo-50 text-indigo-900'
                        : isArchived
                        ? 'text-gray-400'
                        : 'text-gray-900'
                    }`}
                    {...getItemProps({ index, item })}
                  >
                    <div className={`flex items-center gap-2 ${isArchived ? 'opacity-60' : ''}`}>
                      <div className={`flex-shrink-0 h-6 w-10 relative ${isArchived ? 'grayscale' : ''}`}>
                        <CardImage
                          cardImageLink={item.card_image_link}
                          alt=""
                          fill
                          className="object-contain"
                          sizes="40px"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm truncate font-medium">{item.card_name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {item.bank}
                          {isArchived && <span className="ml-1">(Archived)</span>}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
              {filteredCards.length === 0 && inputValue && (
                <li className="px-3 py-3 text-sm text-gray-500 text-center">
                  No cards found
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </Downshift>
  );
}

function formatRewardCellValue(reward: Reward | undefined, card: Card): string {
  return formatRewardWithUsdEquivalent(reward, card);
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://d2ojrhbh2dincr.cloudfront.net';

export default function CompareClient({ allCards }: CompareClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize from URL query params
  const [slots, setSlots] = useState<(string | null)[]>(() => {
    const cardsParam = searchParams.get('cards');
    if (cardsParam) {
      const slugs = cardsParam.split(',').filter(Boolean).slice(0, 3);
      const validSlugs = slugs.filter(slug => allCards.some(c => c.slug === slug));
      const result: (string | null)[] = [...validSlugs];
      while (result.length < 3) result.push(null);
      return result;
    }
    return [null, null, null];
  });

  // Detailed card data fetched from individual card endpoint (has median stats)
  const [cardDetails, setCardDetails] = useState<Record<string, Card>>({});

  // Fetch detailed card data when slots change
  useEffect(() => {
    const activeSlugs = slots.filter((s): s is string => s !== null);
    const slugsToFetch = activeSlugs.filter(slug => !cardDetails[slug]);
    if (slugsToFetch.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const slug of slugsToFetch) {
        const cdnCard = allCards.find(c => c.slug === slug);
        if (!cdnCard) continue;
        try {
          const res = await fetch(`${API_BASE}/card?card_name=${encodeURIComponent(cdnCard.card_name)}`);
          if (!res.ok) continue;
          const detail: Card = await res.json();
          if (cancelled) return;
          setCardDetails(prev => ({ ...prev, [slug]: detail }));
        } catch {
          // Silently fail — table will show dashes for missing stats
        }
      }
    })();
    return () => { cancelled = true; };
  }, [slots, allCards, cardDetails]);

  // Sync URL when slots change
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const activeSlugs = slots.filter(Boolean);
    if (activeSlugs.length > 0) {
      router.replace(`/compare?cards=${activeSlugs.join(',')}`, { scroll: false });
    } else {
      router.replace('/compare', { scroll: false });
    }
  }, [slots, router]);

  // Track each unique multi-card combination the user actually views,
  // debounced so quick swaps don't all log. We dedupe per session via a ref —
  // re-selecting the same set of cards in a session won't double-count.
  const trackedCombosRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const activeSlugs = slots.filter((s): s is string => Boolean(s));
    if (activeSlugs.length < 2) return;
    const key = [...activeSlugs].sort().join('|');
    if (trackedCombosRef.current.has(key)) return;
    const t = setTimeout(() => {
      trackedCombosRef.current.add(key);
      trackCardCompareEvent(activeSlugs);
    }, 1500);
    return () => clearTimeout(t);
  }, [slots]);

  // Merge CDN card data with detailed card data (which has median stats)
  const selectedCards = useMemo(() => {
    return slots.map(slug => {
      if (!slug) return null;
      const cdnCard = allCards.find(c => c.slug === slug);
      if (!cdnCard) return null;
      const detail = cardDetails[slug];
      if (detail) return { ...cdnCard, ...detail, slug: cdnCard.slug };
      return cdnCard;
    });
  }, [slots, allCards, cardDetails]);

  const activeCards = useMemo(() => {
    return selectedCards.filter((c): c is Card => c !== null);
  }, [selectedCards]);

  const excludeSlugs = useMemo(() => {
    return slots.filter((s): s is string => s !== null);
  }, [slots]);

  const handleSelect = useCallback((index: number, card: Card) => {
    setSlots(prev => {
      const next = [...prev];
      next[index] = card.slug;
      return next;
    });
  }, []);

  const handleClear = useCallback((index: number) => {
    setSlots(prev => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }, []);

  // Build unified reward categories across all selected cards
  const unifiedCategories = useMemo(() => {
    if (activeCards.length < 2) return [];

    const categorySet = new Set<string>();
    for (const card of activeCards) {
      if (card.rewards) {
        for (const r of card.rewards) {
          categorySet.add(r.category);
        }
      }
    }

    const categories = Array.from(categorySet);

    // Sort by max value across all cards (descending), everything_else last
    categories.sort((a, b) => {
      if (a === 'everything_else') return 1;
      if (b === 'everything_else') return -1;

      const maxA = Math.max(...activeCards.map(card => {
        const r = card.rewards?.find(rw => rw.category === a);
        return r ? getRewardUsdRate(r, card) : 0;
      }));
      const maxB = Math.max(...activeCards.map(card => {
        const r = card.rewards?.find(rw => rw.category === b);
        return r ? getRewardUsdRate(r, card) : 0;
      }));
      return maxB - maxA;
    });

    return categories;
  }, [activeCards]);

  // Helper: find all indices that tie for best value
  const getBestIndices = useCallback((values: (number | null | undefined)[], mode: 'min' | 'max'): Set<number> => {
    let bestVal: number | null = null;
    values.forEach((v) => {
      if (v === null || v === undefined) return;
      if (bestVal === null ||
        (mode === 'min' && v < bestVal) ||
        (mode === 'max' && v > bestVal)) {
        bestVal = v;
      }
    });
    if (bestVal === null) return new Set();
    const indices = new Set<number>();
    values.forEach((v, i) => {
      if (v === bestVal) indices.add(i);
    });
    return indices;
  }, []);

  return (
    <div className="mt-6">
      {/* Card Pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <CardPicker
            key={i}
            allCards={allCards}
            selectedCard={selectedCards[i]}
            excludeSlugs={excludeSlugs}
            onSelect={(card) => handleSelect(i, card)}
            onClear={() => handleClear(i)}
            slotIndex={i}
          />
        ))}
      </div>

      {/* Comparison Table or Empty State */}
      {activeCards.length < 2 ? (
        <div className="mt-16 text-center">
          <ScaleIcon className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">Compare Cards</h3>
          <p className="mt-2 text-sm text-gray-500">
            Select 2 or 3 cards above to compare them side-by-side.
          </p>
        </div>
      ) : (
        <>
        {/* Mobile: Stacked cards */}
        <div className="mt-8 sm:hidden space-y-6">
          {activeCards.map((card, cardIdx) => {
            const feeValues = activeCards.map(c => c.annual_fee);
            const feeBest = getBestIndices(feeValues, 'min');
            const bonusValues = activeCards.map(c => {
              if (!c.signup_bonus) return null;
              if (c.signup_bonus.type === 'cash' || c.signup_bonus.type === 'cashback') return c.signup_bonus.value;
              const est = formatEstimatedValue(c);
              if (est) return parseInt(est.replace(/[~$,]/g, ''));
              return c.signup_bonus.value;
            });
            const bonusBest = getBestIndices(bonusValues, 'max');
            const scoreValues = activeCards.map(c => c.approved_median_credit_score ?? null);
            const scoreBest = getBestIndices(scoreValues, 'min');

            return (
              <div key={card.slug} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Card header */}
                <div className="px-4 py-4 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
                  <div className="flex-shrink-0 h-12 w-20 relative">
                    <CardImage
                      cardImageLink={card.card_image_link}
                      alt={card.card_name}
                      fill
                      className="object-contain rounded"
                      sizes="80px"
                    />
                  </div>
                  <div className="min-w-0">
                    <Link href={`/card/${card.slug}`} className="text-sm font-semibold text-gray-900 hover:text-indigo-600 block truncate">
                      {card.card_name}
                    </Link>
                    <p className="text-xs text-gray-500">{card.bank}</p>
                  </div>
                </div>

                {/* Attribute rows */}
                <div className="divide-y divide-gray-100">
                  {/* Annual Fee */}
                  <div className={`flex justify-between px-4 py-2.5 text-sm ${feeBest.has(cardIdx) ? 'bg-green-50' : ''}`}>
                    <span className="text-gray-500 font-medium">Annual Fee</span>
                    <span className={`font-medium ${feeBest.has(cardIdx) ? 'text-green-700' : 'text-gray-900'}`}>
                      {formatAnnualFee(card.annual_fee)}/yr
                    </span>
                  </div>

                  {/* Reward Type */}
                  <div className="flex justify-between items-center px-4 py-2.5 text-sm">
                    <span className="text-gray-500 font-medium">Reward Type</span>
                    <RewardTypeBadge type={card.reward_type} />
                  </div>

                  {/* Signup Bonus */}
                  <div className={`flex justify-between px-4 py-2.5 text-sm ${bonusBest.has(cardIdx) && card.signup_bonus ? 'bg-green-50' : ''}`}>
                    <span className="text-gray-500 font-medium">Signup Bonus</span>
                    {card.signup_bonus ? (
                      <span className="text-right">
                        <span className={`font-semibold ${bonusBest.has(cardIdx) ? 'text-green-700' : 'text-gray-900'}`}>
                          {formatBonusValue(card)}
                        </span>
                        {formatEstimatedValue(card) && (
                          <span className="text-gray-500 text-xs ml-1">({formatEstimatedValue(card)})</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400">{'\u2014'}</span>
                    )}
                  </div>

                  {/* Spend Requirement */}
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-500 font-medium">Spend Requirement</span>
                    {card.signup_bonus ? (
                      <span className="text-gray-900">${card.signup_bonus.spend_requirement.toLocaleString()} in {card.signup_bonus.timeframe_months} mo</span>
                    ) : (
                      <span className="text-gray-400">{'\u2014'}</span>
                    )}
                  </div>

                  {/* Reward Categories */}
                  {unifiedCategories.map((cat) => {
                    const specific = card.rewards?.find(rw => rw.category === cat);
                    const fallback = !specific && cat !== 'everything_else'
                      ? card.rewards?.find(rw => rw.category === 'everything_else')
                      : undefined;
                    const reward = specific || fallback;
                    const isFallback = !specific && !!fallback;

                    const catValues = activeCards.map(c => {
                      const r = c.rewards?.find(rw => rw.category === cat);
                      return r ? getRewardUsdRate(r, c) : null;
                    });
                    const catBest = cat !== 'everything_else' ? getBestIndices(catValues, 'max') : new Set<number>();
                    const isBest = catBest.has(cardIdx) && specific !== undefined;

                    return (
                      <div key={cat} className={`flex justify-between px-4 py-2 text-sm ${isBest ? 'bg-green-50' : ''}`}>
                        <span className="text-gray-500 flex items-center gap-1.5">
                          <CategoryIcon category={cat} className="h-3.5 w-3.5 text-gray-400" />
                          {categoryLabels[cat] || cat}
                        </span>
                        <span className={`${isBest ? 'text-green-700 font-semibold' : isFallback ? 'text-gray-400 italic' : 'text-gray-900'}`}>
                          {formatRewardCellValue(reward, card)}
                          {reward?.note && !isFallback && (
                            <span className="text-gray-400 text-xs ml-1">*</span>
                          )}
                        </span>
                      </div>
                    );
                  })}

                  {/* APR section */}
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-500 font-medium">Purchase Intro APR</span>
                    {card.apr?.purchase_intro ? (
                      <span className="text-gray-900">{card.apr.purchase_intro.rate}% for {card.apr.purchase_intro.months} mo</span>
                    ) : (
                      <span className="text-gray-400">{'\u2014'}</span>
                    )}
                  </div>
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-500 font-medium">BT Intro APR</span>
                    {card.apr?.balance_transfer_intro ? (
                      <span className="text-gray-900">{card.apr.balance_transfer_intro.rate}% for {card.apr.balance_transfer_intro.months} mo</span>
                    ) : (
                      <span className="text-gray-400">{'\u2014'}</span>
                    )}
                  </div>
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-500 font-medium">Regular APR</span>
                    {card.apr?.regular ? (
                      <span className="text-gray-900">{card.apr.regular.min}%&ndash;{card.apr.regular.max}%</span>
                    ) : (
                      <span className="text-gray-400">{'\u2014'}</span>
                    )}
                  </div>

                  {/* Approval stats */}
                  <div className={`flex justify-between px-4 py-2.5 text-sm ${scoreBest.has(cardIdx) && card.approved_median_credit_score ? 'bg-green-50' : ''}`}>
                    <span className="text-gray-500 font-medium">Median Credit Score</span>
                    <span className={`font-medium ${scoreBest.has(cardIdx) && card.approved_median_credit_score ? 'text-green-700' : 'text-gray-900'}`}>
                      {card.approved_median_credit_score ?? <span className="text-gray-400">{'\u2014'}</span>}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-500 font-medium">Median Income</span>
                    {card.approved_median_income ? (
                      <span className="text-gray-900">${card.approved_median_income.toLocaleString()}</span>
                    ) : (
                      <span className="text-gray-400">{'\u2014'}</span>
                    )}
                  </div>

                  {/* Benefits */}
                  {card.benefits && card.benefits.length > 0 && (() => {
                    const credits = card.benefits.filter(b => b.value > 0);
                    const perks = card.benefits.filter(b => b.value === 0);
                    const totalAnnual = credits.reduce((sum, b) => sum + amortizedAnnualValue(b), 0);
                    return (
                      <div className="px-4 py-2.5 text-sm">
                        <span className="text-gray-500 font-medium block mb-1">Benefits</span>
                        {totalAnnual > 0 && (
                          <div className="font-semibold text-emerald-700 mb-1">${totalAnnual}/yr in credits</div>
                        )}
                        <div className="text-xs text-gray-500 space-y-0.5">
                          {credits.map(b => (
                            <div key={b.name}>{b.name} ({formatBenefitValue(b)}{b.frequency === 'annual' ? '/yr' : b.frequency === 'monthly' ? '/mo' : b.frequency === 'quarterly' ? '/qtr' : ''})</div>
                          ))}
                          {perks.length > 0 && (
                            <div className="text-gray-400 mt-1">+{perks.length} perk{perks.length !== 1 ? 's' : ''}</div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: Side-by-side table */}
        <div className="mt-8 overflow-x-auto hidden sm:block">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 w-40 sm:w-48" />
                {activeCards.map((card) => (
                  <th key={card.slug} className="px-4 py-3 text-center font-semibold text-sm text-gray-900 bg-gray-50 border-b border-gray-200">
                    <Link href={`/card/${card.slug}`} className="hover:text-indigo-600 transition-colors">
                      {card.card_name}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Card Image */}
              <tr>
                <td className="sticky left-0 z-10 bg-white px-4 py-3 text-sm font-medium text-gray-500">Card</td>
                {activeCards.map((card) => (
                  <td key={card.slug} className="px-4 py-3 text-center">
                    <div className="mx-auto w-32 h-20 relative">
                      <CardImage
                        cardImageLink={card.card_image_link}
                        alt={card.card_name}
                        fill
                        className="object-contain rounded-lg"
                        sizes="128px"
                      />
                    </div>
                  </td>
                ))}
              </tr>

              {/* Bank */}
              <tr className="bg-gray-50/50">
                <td className="sticky left-0 z-10 bg-gray-50/50 px-4 py-3 text-sm font-medium text-gray-500">Bank</td>
                {activeCards.map((card) => (
                  <td key={card.slug} className="px-4 py-3 text-center text-sm text-gray-900">
                    <Link href={`/bank/${encodeURIComponent(card.bank)}`} className="hover:text-indigo-600">
                      {card.bank}
                    </Link>
                  </td>
                ))}
              </tr>

              {/* Annual Fee */}
              {(() => {
                const fees = activeCards.map(c => c.annual_fee);
                const bestSet = getBestIndices(fees, 'min');
                return (
                  <tr>
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 text-sm font-medium text-gray-500">Annual Fee</td>
                    {activeCards.map((card, i) => (
                      <td key={card.slug} className={`px-4 py-3 text-center text-sm font-medium ${bestSet.has(i) ? 'text-green-700 bg-green-50' : 'text-gray-900'}`}>
                        {formatAnnualFee(card.annual_fee)}/yr
                      </td>
                    ))}
                  </tr>
                );
              })()}

              {/* Reward Type */}
              <tr className="bg-gray-50/50">
                <td className="sticky left-0 z-10 bg-gray-50/50 px-4 py-3 text-sm font-medium text-gray-500">Reward Type</td>
                {activeCards.map((card) => (
                  <td key={card.slug} className="px-4 py-3 text-center">
                    <RewardTypeBadge type={card.reward_type} />
                  </td>
                ))}
              </tr>

              {/* Signup Bonus */}
              {(() => {
                const bonusValues = activeCards.map(c => {
                  if (!c.signup_bonus) return null;
                  if (c.signup_bonus.type === 'cash' || c.signup_bonus.type === 'cashback') {
                    return c.signup_bonus.value;
                  }
                  const est = formatEstimatedValue(c);
                  if (est) return parseInt(est.replace(/[~$,]/g, ''));
                  return c.signup_bonus.value;
                });
                const bestSet = getBestIndices(bonusValues, 'max');
                return (
                  <tr>
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 text-sm font-medium text-gray-500">Signup Bonus</td>
                    {activeCards.map((card, i) => (
                      <td key={card.slug} className={`px-4 py-3 text-center text-sm ${bestSet.has(i) && card.signup_bonus ? 'bg-green-50' : ''}`}>
                        {card.signup_bonus ? (
                          <div>
                            <span className={`font-semibold ${bestSet.has(i) ? 'text-green-700' : 'text-gray-900'}`}>
                              {formatBonusValue(card)}
                            </span>
                            {formatEstimatedValue(card) && (
                              <span className="text-gray-500 text-xs ml-1">({formatEstimatedValue(card)})</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">{'\u2014'}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })()}

              {/* Spend Requirement */}
              <tr className="bg-gray-50/50">
                <td className="sticky left-0 z-10 bg-gray-50/50 px-4 py-3 text-sm font-medium text-gray-500">Spend Requirement</td>
                {activeCards.map((card) => (
                  <td key={card.slug} className="px-4 py-3 text-center text-sm text-gray-900">
                    {card.signup_bonus ? (
                      <span>
                        ${card.signup_bonus.spend_requirement.toLocaleString()} in {card.signup_bonus.timeframe_months} mo
                      </span>
                    ) : (
                      <span className="text-gray-400">{'\u2014'}</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Reward Categories (unified) */}
              {unifiedCategories.map((cat, catIdx) => {
                // For each card, find the specific reward or fall back to everything_else
                const rewardsPerCard = activeCards.map(card => {
                  const specific = card.rewards?.find(rw => rw.category === cat);
                  if (specific) return { reward: specific, isFallback: false };
                  if (cat !== 'everything_else') {
                    const fallback = card.rewards?.find(rw => rw.category === 'everything_else');
                    if (fallback) return { reward: fallback, isFallback: true };
                  }
                  return { reward: undefined, isFallback: false };
                });

                const values = rewardsPerCard.map((r, i) => {
                  if (!r.reward) return null;
                  return getRewardUsdRate(r.reward, activeCards[i]);
                });
                const bestSet = cat !== 'everything_else' ? getBestIndices(values, 'max') : new Set<number>();
                const isEven = catIdx % 2 === 0;

                return (
                  <tr key={cat} className={isEven ? '' : 'bg-gray-50/50'}>
                    <td className={`sticky left-0 z-10 ${isEven ? 'bg-white' : 'bg-gray-50/50'} px-4 py-2.5 text-sm font-medium text-gray-500`}>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">
                          <CategoryIcon category={cat} className="h-4 w-4" />
                        </span>
                        <span className="truncate">{categoryLabels[cat] || cat}</span>
                      </div>
                    </td>
                    {activeCards.map((card, i) => {
                      const { reward, isFallback } = rewardsPerCard[i];
                      const isBest = bestSet.has(i) && reward !== undefined;
                      return (
                        <td key={card.slug} className={`px-4 py-2.5 text-center text-sm ${isBest && !isFallback ? 'text-green-700 font-semibold bg-green-50' : reward && !isFallback ? 'text-gray-900' : 'text-gray-400'} ${isFallback ? 'italic' : ''}`}>
                          <span className="inline-flex items-center gap-1 justify-center">
                            {formatRewardCellValue(reward, card)}
                            {reward?.note && !isFallback && (
                              <span className="relative group">
                                <InformationCircleIcon className="h-3.5 w-3.5 text-gray-300 hover:text-gray-500 cursor-help" />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-md w-48 text-left opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                                  {reward.note}
                                </span>
                              </span>
                            )}
                          </span>
                          {!isFallback && reward?.spend_cap && (
                            <div className="text-xs text-gray-500 mt-0.5">{formatRewardCapCaveat(reward)}</div>
                          )}
                          {!isFallback && reward?.mode === 'quarterly_rotating' && (
                            <div className="text-xs text-gray-400 mt-0.5">Rotating</div>
                          )}
                          {!isFallback && reward?.mode === 'user_choice' && (
                            <div className="text-xs text-gray-400 mt-0.5">You choose{reward.choices ? ` ${reward.choices}` : ''}</div>
                          )}
                          {!isFallback && reward?.mode === 'auto_top_spend' && (
                            <div className="text-xs text-gray-400 mt-0.5">Auto top spend</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Purchase Intro APR */}
              <tr className={unifiedCategories.length % 2 === 0 ? '' : 'bg-gray-50/50'}>
                <td className={`sticky left-0 z-10 ${unifiedCategories.length % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} px-4 py-3 text-sm font-medium text-gray-500`}>Purchase Intro APR</td>
                {activeCards.map((card) => (
                  <td key={card.slug} className="px-4 py-3 text-center text-sm text-gray-900">
                    {card.apr?.purchase_intro ? (
                      <span>{card.apr.purchase_intro.rate}% for {card.apr.purchase_intro.months} mo</span>
                    ) : (
                      <span className="text-gray-400">{'\u2014'}</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Balance Transfer Intro APR */}
              <tr className={unifiedCategories.length % 2 === 0 ? 'bg-gray-50/50' : ''}>
                <td className={`sticky left-0 z-10 ${unifiedCategories.length % 2 === 0 ? 'bg-gray-50/50' : 'bg-white'} px-4 py-3 text-sm font-medium text-gray-500`}>BT Intro APR</td>
                {activeCards.map((card) => (
                  <td key={card.slug} className="px-4 py-3 text-center text-sm text-gray-900">
                    {card.apr?.balance_transfer_intro ? (
                      <span>{card.apr.balance_transfer_intro.rate}% for {card.apr.balance_transfer_intro.months} mo</span>
                    ) : (
                      <span className="text-gray-400">{'\u2014'}</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Regular APR */}
              <tr>
                <td className="sticky left-0 z-10 bg-white px-4 py-3 text-sm font-medium text-gray-500">Regular APR</td>
                {activeCards.map((card) => (
                  <td key={card.slug} className="px-4 py-3 text-center text-sm text-gray-900">
                    {card.apr?.regular ? (
                      <span>{card.apr.regular.min}%&ndash;{card.apr.regular.max}%</span>
                    ) : (
                      <span className="text-gray-400">{'\u2014'}</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Median Credit Score */}
              {(() => {
                const scores = activeCards.map(c => c.approved_median_credit_score ?? null);
                const bestSet = getBestIndices(scores, 'min');
                return (
                  <tr className="bg-gray-50/50">
                    <td className="sticky left-0 z-10 bg-gray-50/50 px-4 py-3 text-sm font-medium text-gray-500">Median Credit Score</td>
                    {activeCards.map((card, i) => (
                      <td key={card.slug} className={`px-4 py-3 text-center text-sm font-medium ${bestSet.has(i) && card.approved_median_credit_score ? 'text-green-700 bg-green-50' : 'text-gray-900'}`}>
                        {card.approved_median_credit_score ?? <span className="text-gray-400">{'\u2014'}</span>}
                      </td>
                    ))}
                  </tr>
                );
              })()}

              {/* Median Income */}
              <tr>
                <td className="sticky left-0 z-10 bg-white px-4 py-3 text-sm font-medium text-gray-500">Median Income</td>
                {activeCards.map((card) => (
                  <td key={card.slug} className="px-4 py-3 text-center text-sm text-gray-900">
                    {card.approved_median_income ? (
                      <span>${card.approved_median_income.toLocaleString()}</span>
                    ) : (
                      <span className="text-gray-400">{'\u2014'}</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Benefits */}
              {activeCards.some(c => c.benefits && c.benefits.length > 0) && (() => {
                const totalCredits = activeCards.map(c => {
                  if (!c.benefits) return 0;
                  return c.benefits.filter(b => b.value > 0).reduce(
                    (sum, b) => sum + amortizedAnnualValue(b),
                    0
                  );
                });
                const bestSet = getBestIndices(totalCredits.map(v => v || null), 'max');
                return (
                  <tr className="bg-gray-50/50">
                    <td className="sticky left-0 z-10 bg-gray-50/50 px-4 py-3 text-sm font-medium text-gray-500">Benefits</td>
                    {activeCards.map((card, i) => (
                      <td key={card.slug} className={`px-4 py-3 text-center text-sm ${bestSet.has(i) && totalCredits[i] > 0 ? 'bg-green-50' : ''}`}>
                        {card.benefits && card.benefits.length > 0 ? (
                          <div>
                            {totalCredits[i] > 0 && (
                              <div className={`font-semibold mb-1.5 ${bestSet.has(i) ? 'text-green-700' : 'text-gray-900'}`}>
                                ${totalCredits[i]}/yr in credits
                              </div>
                            )}
                            <div className="text-xs text-gray-500 space-y-0.5">
                              {card.benefits.filter(b => b.value > 0).map(b => (
                                <div key={b.name}>{b.name} ({formatBenefitValue(b)}{b.frequency === 'annual' ? '/yr' : b.frequency === 'monthly' ? '/mo' : b.frequency === 'quarterly' ? '/qtr' : ''})</div>
                              ))}
                              {card.benefits.filter(b => b.value === 0).length > 0 && (
                                <div className="text-gray-400 mt-1">
                                  +{card.benefits.filter(b => b.value === 0).length} perk{card.benefits.filter(b => b.value === 0).length !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">{'\u2014'}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })()}

            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
