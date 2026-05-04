'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { Card, WalletCard, Reward } from '@/lib/api';
import { categoryLabels, formatRewardWithUsdEquivalent, getRewardUsdRate } from '@/lib/cardDisplayUtils';

const canonicalOrder = Object.keys(categoryLabels).filter(c => c !== 'everything_else');

// Returns the canonical "QN YYYY" label for the current quarter (UTC), used to
// detect rotating rewards whose `current_period` hasn't been refreshed yet.
function currentQuarterLabel(now: Date = new Date()): string {
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `Q${q} ${now.getUTCFullYear()}`;
}

function isStaleRotation(reward: Reward, expected: string): boolean {
  if (reward.mode !== 'quarterly_rotating') return false;
  const cur = reward.current_period;
  if (!cur) return true;
  return cur.trim().toUpperCase() !== expected.toUpperCase();
}

// A reward is "conditional" if it carries a note OR is flagged merchant_specific.
// We use this to surface an unrestricted alternative when the top earner is gated
// (e.g. Marriott Bonvoy 6x at Marriott properties vs. a 3x general-hotels card).
function isConditional(reward: Reward) {
  return reward.merchant_specific === true || (!!reward.note && reward.note.trim().length > 0);
}

interface BestCardByCategoryProps {
  walletCards: WalletCard[];
  allCards: Card[];
}

interface Pick {
  card: Card;
  reward: Reward;
  usdRate: number;
  // True when this pick was slotted into a category via the reward's
  // current_categories (rotating-bonus expansion) rather than declared directly.
  rotating?: boolean;
  // True when the rotating reward's current_period doesn't match the actual
  // current quarter — the listed bonus categories may be outdated.
  staleRotation?: boolean;
  // Slot-specific note from current_categories[i].note. Falls back to reward.note in render.
  slotNote?: string;
}

interface CategoryBest {
  category: string;
  label: string;
  primary: Pick;
  alternative?: Pick;
}

export default function BestCardByCategory({ walletCards, allCards }: BestCardByCategoryProps) {
  const categoryBests = useMemo<CategoryBest[]>(() => {
    if (walletCards.length === 0 || allCards.length === 0) return [];

    const walletCardData = walletCards
      .map(wc => allCards.find(c => c.card_name === wc.card_name))
      .filter((c): c is Card => c !== undefined && !!c.rewards && c.rewards.length > 0);

    if (walletCardData.length === 0) return [];

    const expectedQuarter = currentQuarterLabel();

    // Collect every (card, reward) pair per category, then sort by USD rate.
    const picksByCategory = new Map<string, Pick[]>();
    const push = (cat: string, pick: Pick) => {
      const list = picksByCategory.get(cat) ?? [];
      list.push(pick);
      picksByCategory.set(cat, list);
    };

    for (const card of walletCardData) {
      // Index each card's permanent (non-rotating) per-category rates so
      // we can suppress rotating slots that are already covered at >= rate
      // by a permanent reward on the same card (e.g. Freedom Flex's
      // permanent 5% travel_portal vs. its rotating travel_portal slot).
      const permanentRates = new Map<string, number>();
      for (const reward of card.rewards!) {
        if (reward.mode === 'quarterly_rotating') continue;
        const r = getRewardUsdRate(reward, card);
        const prev = permanentRates.get(reward.category) ?? 0;
        if (r > prev) permanentRates.set(reward.category, r);
      }

      for (const reward of card.rewards!) {
        if (reward.category === 'everything_else') continue;
        const usdRate = getRewardUsdRate(reward, card);

        // Quarterly rotating rewards: slot the bonus rate under each of this
        // quarter's actual categories (e.g. groceries, gas) so users see the
        // card competing where it currently earns the bonus. Skip the
        // umbrella "rotating" row in that case to avoid duplication.
        if (
          reward.mode === 'quarterly_rotating' &&
          reward.current_categories &&
          reward.current_categories.length > 0
        ) {
          const stale = isStaleRotation(reward, expectedQuarter);
          for (const entry of reward.current_categories) {
            const cat = typeof entry === 'string' ? entry : entry.category;
            const slotNote = typeof entry === 'string' ? undefined : entry.note;
            if (!cat || cat === 'everything_else') continue;
            // Same card already earns >= rate permanently in this category — skip.
            const perm = permanentRates.get(cat) ?? 0;
            if (perm >= usdRate) continue;
            push(cat, { card, reward, usdRate, rotating: true, staleRotation: stale, slotNote });
          }
          continue;
        }

        push(reward.category, { card, reward, usdRate });
      }
    }

    const buildEntry = (category: string): CategoryBest | null => {
      const picks = picksByCategory.get(category);
      if (!picks || picks.length === 0) return null;
      picks.sort((a, b) => b.usdRate - a.usdRate);
      const primary = picks[0];

      let alternative: Pick | undefined;
      if (isConditional(primary.reward)) {
        // Find the best unrestricted pick from a *different* card.
        alternative = picks.find(p => !isConditional(p.reward) && p.card.card_name !== primary.card.card_name);
      }

      return {
        category,
        label: categoryLabels[category] || category,
        primary,
        alternative,
      };
    };

    const seen = new Set<string>();
    const results: CategoryBest[] = [];
    for (const category of canonicalOrder) {
      const entry = buildEntry(category);
      if (entry) {
        results.push(entry);
        seen.add(category);
      }
    }
    for (const category of picksByCategory.keys()) {
      if (seen.has(category)) continue;
      const entry = buildEntry(category);
      if (entry) results.push(entry);
    }

    return results;
  }, [walletCards, allCards]);

  if (categoryBests.length === 0) return null;

  return (
    <div className="bg-white shadow rounded-lg p-6 mt-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Best Card by Category
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 align-middle">Experimental</span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">Which card in your wallet earns the most for each spending category. When the top earner is brand- or merchant-restricted, we also surface the best unrestricted option.</p>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Best Card</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Rate</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {categoryBests.map(({ category, label, primary, alternative }) => (
              <tr key={category} className="align-top">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {label}
                </td>
                <td className="px-4 py-3">
                  <PickRow pick={primary} />
                  {alternative && (
                    <div className="mt-2 pt-2 border-t border-dashed border-gray-200">
                      <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">All {label.toLowerCase()}</div>
                      <PickRow pick={alternative} />
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <RateBadge pick={primary} />
                  {alternative && (
                    <div className="mt-2 pt-2 border-t border-dashed border-gray-200">
                      <div className="invisible text-[11px] mb-1">.</div>
                      <RateBadge pick={alternative} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile layout */}
      <div className="sm:hidden divide-y divide-gray-200">
        {categoryBests.map(({ category, label, primary, alternative }) => (
          <div key={category} className="py-3">
            <div className="text-sm font-medium text-gray-900 mb-2">{label}</div>
            <MobilePickRow pick={primary} />
            {alternative && (
              <div className="mt-2 pt-2 border-t border-dashed border-gray-200">
                <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">All {label.toLowerCase()}</div>
                <MobilePickRow pick={alternative} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PickRow({ pick }: { pick: Pick }) {
  const { card, reward, rotating, staleRotation, slotNote } = pick;
  const note = slotNote ?? reward.note;
  const href = card.slug ? `/card/${card.slug}` : undefined;
  return (
    <div className={`flex items-start gap-3 ${staleRotation ? 'opacity-60' : ''}`}>
      <div className="flex-shrink-0 h-8 w-12 relative">
        <CardImage
          cardImageLink={card.card_image_link}
          alt={card.card_name}
          fill
          className="object-contain"
          sizes="48px"
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {href ? (
            <Link href={href} className="text-sm text-gray-900 hover:text-indigo-600 hover:underline">
              {card.card_name}
            </Link>
          ) : (
            <span className="text-sm text-gray-900">{card.card_name}</span>
          )}
          {rotating && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
              staleRotation ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'
            }`}>
              Rotating{reward.current_period ? ` · ${reward.current_period}` : ''}
            </span>
          )}
          {staleRotation && (
            <span className="text-[11px] text-amber-700">may be outdated</span>
          )}
        </div>
        {note && (
          <div className="text-xs text-gray-500 mt-0.5">{note}</div>
        )}
      </div>
    </div>
  );
}

function MobilePickRow({ pick }: { pick: Pick }) {
  const { card, reward, rotating, staleRotation, slotNote } = pick;
  const note = slotNote ?? reward.note;
  const href = card.slug ? `/card/${card.slug}` : undefined;
  return (
    <div className={`flex items-start justify-between gap-2 ${staleRotation ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2 min-w-0">
        <div className="flex-shrink-0 h-6 w-10 relative">
          <CardImage
            cardImageLink={card.card_image_link}
            alt={card.card_name}
            fill
            className="object-contain"
            sizes="40px"
          />
        </div>
        <div className="min-w-0">
          {href ? (
            <Link href={href} className="block text-xs text-gray-900 truncate hover:text-indigo-600 hover:underline">
              {card.card_name}
            </Link>
          ) : (
            <div className="text-xs text-gray-900 truncate">{card.card_name}</div>
          )}
          {rotating && (
            <span className={`inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${
              staleRotation ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'
            }`}>
              Rotating{reward.current_period ? ` · ${reward.current_period}` : ''}
            </span>
          )}
          {staleRotation && (
            <div className="text-[10px] text-amber-700 mt-0.5">may be outdated</div>
          )}
          {note && (
            <div className="text-[11px] text-gray-500 mt-0.5">{note}</div>
          )}
        </div>
      </div>
      <RateBadge pick={pick} />
    </div>
  );
}

function RateBadge({ pick }: { pick: Pick }) {
  const { card, reward } = pick;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
      reward.unit === 'percent'
        ? 'bg-green-100 text-green-800'
        : 'bg-indigo-100 text-indigo-800'
    }`}>
      {formatRewardWithUsdEquivalent(reward, card)}
    </span>
  );
}
