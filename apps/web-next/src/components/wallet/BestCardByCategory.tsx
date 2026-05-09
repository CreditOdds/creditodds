'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { Card, WalletCard, Reward } from '@/lib/api';
import { categoryLabels, formatRewardWithUsdEquivalent, getRewardUsdRate } from '@/lib/cardDisplayUtils';
import { dedupeWalletByCardName } from '@/app/profile/profileSelectors';

const canonicalOrder = Object.keys(categoryLabels).filter(c => c !== 'everything_else');

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
  rotating?: boolean;
  staleRotation?: boolean;
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

    // Dedupe by card_name — a card can't beat itself in a category ranking.
    const uniqueWalletCards = dedupeWalletByCardName(walletCards);
    const walletCardData = uniqueWalletCards
      .map(wc => allCards.find(c => c.card_name === wc.card_name))
      .filter((c): c is Card => c !== undefined && !!c.rewards && c.rewards.length > 0);

    if (walletCardData.length === 0) return [];

    const expectedQuarter = currentQuarterLabel();

    const picksByCategory = new Map<string, Pick[]>();
    const push = (cat: string, pick: Pick) => {
      const list = picksByCategory.get(cat) ?? [];
      list.push(pick);
      picksByCategory.set(cat, list);
    };

    for (const card of walletCardData) {
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

  const reportUrl = `https://github.com/CreditOdds/creditodds/issues/new?${new URLSearchParams({
    title: 'Wallet-wide rankings: issue report',
    labels: 'feedback,wallet-wide-rankings',
    body: [
      '**Feature:** Wallet-wide rankings (Best card by category)',
      '**Page:** https://creditodds.com/profile (Rewards tab)',
      `**Wallet size:** ${walletCards.length} card${walletCards.length === 1 ? '' : 's'}`,
      `**Categories shown:** ${categoryBests.length}`,
      '',
      '### Issue type',
      "<!-- delete the ones that don't apply -->",
      '- Wrong card picked for a category',
      '- Missing category',
      '- Wrong earn rate / USD value',
      '- Other bug',
      '- Suggestion',
      '',
      '### Which category is affected?',
      '',
      '',
      '### What did you expect to see vs. what was shown?',
      '',
    ].join('\n'),
  }).toString()}`;

  if (categoryBests.length === 0) {
    return (
      <div className="cj-verdict">
        <b>No category data yet.</b> Add cards to your wallet to see which one earns the most for each spending category.
      </div>
    );
  }

  return (
    <section className="cj-section">
      <div className="cj-table-label" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={{ flex: '1 1 320px', minWidth: 0 }}>
          Derived from rewards on the cards you hold. When the top earner is brand- or merchant-restricted, an unrestricted alternative is shown below it.
        </span>
        <a
          href={reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 600 }}
        >
          Report an issue →
        </a>
      </div>
      <table className="cj-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Best in your wallet</th>
            <th className="cj-tr">Earn</th>
          </tr>
        </thead>
        <tbody>
          {categoryBests.map(({ category, label, primary, alternative }) => (
            <tr key={category}>
              <td>
                <div className="cj-cell-primary">{label}</div>
              </td>
              <td>
                <PickCell pick={primary} />
                {alternative && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--line)' }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted-2)', fontWeight: 600, marginBottom: 4 }}>
                      All {label.toLowerCase()}
                    </div>
                    <PickCell pick={alternative} />
                  </div>
                )}
              </td>
              <td className="cj-tr">
                <RateCell pick={primary} />
                {alternative && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--line)' }}>
                    <div style={{ fontSize: 10, marginBottom: 4, visibility: 'hidden' }}>.</div>
                    <RateCell pick={alternative} />
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PickCell({ pick }: { pick: Pick }) {
  const { card, reward, rotating, staleRotation, slotNote } = pick;
  const note = slotNote ?? reward.note;
  const href = card.slug ? `/card/${card.slug}` : undefined;
  const wrapper = (
    <div className="cj-rew-best" style={staleRotation ? { opacity: 0.6 } : undefined}>
      <span className="cj-rew-thumb">
        <CardImage cardImageLink={card.card_image_link} alt={card.card_name} fill className="object-contain" sizes="32px" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="cj-cell-primary" style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span>{card.card_name}</span>
          {rotating && (
            <span style={{
              fontSize: 9.5,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '1px 5px',
              borderRadius: 2,
              background: staleRotation ? '#fef9e8' : 'var(--accent-2)',
              color: staleRotation ? '#a8792a' : 'var(--accent)',
            }}>
              rotating{reward.current_period ? ` · ${reward.current_period}` : ''}
            </span>
          )}
        </div>
        {note && <div className="cj-cell-detail">{note}</div>}
        {staleRotation && <div className="cj-cell-detail" style={{ color: '#a8792a' }}>may be outdated</div>}
      </div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{wrapper}</Link> : wrapper;
}

function RateCell({ pick }: { pick: Pick }) {
  const { card, reward } = pick;
  return <span className="cj-eff-pct">{formatRewardWithUsdEquivalent(reward, card)}</span>;
}
