'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { V2Footer } from '@/components/landing-v2/Chrome';
import type { Card, Reward } from '@/lib/api';
import { categoryLabels } from '@/lib/cardDisplayUtils';
import { cardMatchesSearch } from '@/lib/searchAliases';
import '../landing.css';

interface ExploreV2ClientProps {
  cards: Card[];
  trendingViews?: Record<number, number>;
}

type SortKey = 'trending' | 'odds' | 'records' | 'fee';
type ViewMode = 'grid' | 'table';

function feeTone(fee: number | undefined): 'none' | 'mid' | 'high' {
  if (!fee) return 'none';
  if (fee >= 200) return 'high';
  return 'mid';
}

const CATEGORIES = ['All', 'Travel', 'Cashback', 'Dining', 'Business'] as const;
type CategoryKey = (typeof CATEGORIES)[number];

function cardCategory(card: Card): CategoryKey {
  const explicit = (card.category || '').toLowerCase();
  if (explicit.includes('travel')) return 'Travel';
  if (explicit.includes('cash') || explicit.includes('cashback')) return 'Cashback';
  if (explicit.includes('dining')) return 'Dining';
  if (explicit.includes('business')) return 'Business';

  const tags = (card.tags ?? []).map((t) => t.toLowerCase());
  if (/business/i.test(card.card_name)) return 'Business';
  if (tags.some((t) => t.includes('travel') || t.includes('miles') || t.includes('airline') || t.includes('hotel'))) return 'Travel';
  if (tags.some((t) => t.includes('dining'))) return 'Dining';

  if (card.reward_type === 'cashback') return 'Cashback';
  if (card.reward_type === 'miles') return 'Travel';
  return 'Cashback';
}

function approvalOdds(card: Card): number | null {
  const a = card.approved_count ?? 0;
  const r = card.rejected_count ?? 0;
  const t = a + r;
  if (t === 0) return null;
  return Math.round((a / t) * 100);
}

function formatBonus(card: Card): { main: string; sub: string | null } {
  const bonus = card.signup_bonus;
  if (!bonus || !bonus.value) return { main: '—', sub: null };
  const isCash = bonus.type === 'cash' || bonus.type === 'cashback';
  const main = isCash
    ? `$${bonus.value.toLocaleString()}`
    : bonus.type === 'free_nights'
    ? `${bonus.value} Free Night${bonus.value !== 1 ? 's' : ''}`
    : bonus.value >= 1000
    ? `${Math.round(bonus.value / 1000)}K ${bonus.type}`
    : `${bonus.value.toLocaleString()} ${bonus.type}`;
  const sub = bonus.spend_requirement
    ? `$${bonus.spend_requirement.toLocaleString()} in ${bonus.timeframe_months}mo`
    : null;
  return { main, sub };
}

function topReward(card: Card): Reward | null {
  const rewards = card.rewards ?? [];
  if (rewards.length === 0) return null;
  return [...rewards].sort((a, b) => b.value - a.value)[0];
}

function formatTopReward(card: Card): string {
  const top = topReward(card);
  if (!top) return '—';
  const rate = top.unit === 'percent' ? `${top.value}%` : `${top.value}x`;
  const label = categoryLabels[top.category] || top.category;
  return `${rate} ${label}`;
}

function rewardTypeLabel(card: Card): string {
  switch (card.reward_type) {
    case 'cashback':
      return 'Cash back';
    case 'points':
      return 'Points';
    case 'miles':
      return 'Miles';
    default:
      return '—';
  }
}

export default function ExploreV2Client({ cards, trendingViews }: ExploreV2ClientProps) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<CategoryKey>('All');
  const [sort, setSort] = useState<SortKey>('trending');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [view, setView] = useState<ViewMode>('table');

  const catCounts = useMemo(() => {
    const counts: Record<CategoryKey, number> = {
      All: 0,
      Travel: 0,
      Cashback: 0,
      Dining: 0,
      Business: 0,
    };
    for (const c of cards) {
      if (!includeArchived && !c.accepting_applications) continue;
      counts.All += 1;
      counts[cardCategory(c)] += 1;
    }
    return counts;
  }, [cards, includeArchived]);

  const filtered = useMemo(() => {
    const q = query.trim();
    const pool = cards.filter((c) => {
      if (!includeArchived && !c.accepting_applications) return false;
      if (cat !== 'All' && cardCategory(c) !== cat) return false;
      if (q && !cardMatchesSearch(c.card_name, c.bank, q)) return false;
      return true;
    });
    const sorted = [...pool];
    if (sort === 'trending') {
      sorted.sort((a, b) => {
        const aViews =
          trendingViews?.[Number(a.db_card_id ?? a.card_id)] ?? 0;
        const bViews =
          trendingViews?.[Number(b.db_card_id ?? b.card_id)] ?? 0;
        if (bViews !== aViews) return bViews - aViews;
        return (
          (b.approved_count ?? 0) +
          (b.rejected_count ?? 0) -
          ((a.approved_count ?? 0) + (a.rejected_count ?? 0))
        );
      });
    } else if (sort === 'odds') {
      sorted.sort((a, b) => (approvalOdds(b) ?? -1) - (approvalOdds(a) ?? -1));
    } else if (sort === 'records') {
      sorted.sort(
        (a, b) =>
          (b.approved_count ?? 0) +
          (b.rejected_count ?? 0) -
          ((a.approved_count ?? 0) + (a.rejected_count ?? 0))
      );
    } else if (sort === 'fee') {
      sorted.sort((a, b) => (a.annual_fee ?? 0) - (b.annual_fee ?? 0));
    }
    return sorted;
  }, [cards, cat, query, sort, includeArchived, trendingViews]);

  return (
    <div className="landing-v2">
      <section className="page-hero wrap">
        <h1 className="page-title">
          Every card, <em>every outcome.</em>
        </h1>
        <p className="page-sub">
          Browse the full catalog with live approval odds pulled from the community
          database. No affiliate ranking — just the math.
        </p>
      </section>

      <div className="wrap">
        <div className="filter-bar">
          <div className="search-row">
            <div className="search-wrap">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                placeholder="Search by card name or issuer…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="view-toggle" role="group" aria-label="View mode">
              <button
                type="button"
                className={'view-btn ' + (view === 'grid' ? 'active' : '')}
                onClick={() => setView('grid')}
                aria-pressed={view === 'grid'}
                title="Grid view"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                className={'view-btn ' + (view === 'table' ? 'active' : '')}
                onClick={() => setView('table')}
                aria-pressed={view === 'table'}
                title="Table view"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>
            </div>
          </div>
          <div className="filter-chip-row">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={'filter-chip ' + (cat === c ? 'active' : '')}
                onClick={() => setCat(c)}
              >
                {c} <span className="ct">{catCounts[c]}</span>
              </button>
            ))}
            <button
              type="button"
              className={'filter-chip ' + (includeArchived ? 'active' : '')}
              onClick={() => setIncludeArchived((v) => !v)}
            >
              Archived
            </button>
          </div>
          <div className="filter-spacer" />
          <div className="filter-actions">
            <span className="sort-label">Sort</span>
            {(
              [
                ['trending', 'Trending'],
                ['odds', 'Odds'],
                ['records', 'Records'],
                ['fee', 'Fee'],
              ] as [SortKey, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                className={'filter-chip ' + (sort === k ? 'active' : '')}
                style={{ padding: '6px 10px', fontSize: 11 }}
                onClick={() => setSort(k)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div
            style={{
              padding: '80px 0',
              textAlign: 'center',
              color: 'var(--muted)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
            }}
          >
            No cards match these filters.
          </div>
        ) : view === 'grid' ? (
          <div className="card-grid">
            {filtered.map((c) => {
              const odds = approvalOdds(c);
              const records = (c.approved_count ?? 0) + (c.rejected_count ?? 0);
              const category = cardCategory(c);
              const archived = !c.accepting_applications;
              const bonus = formatBonus(c);
              return (
                <Link key={c.slug} href={`/card/${c.slug}`} className="cc">
                  <div className="cc-top">
                    <div className="cc-thumb">
                      <CardImage
                        cardImageLink={c.card_image_link}
                        alt=""
                        fill
                        sizes="68px"
                        style={{ objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="cc-name">{c.card_name}</div>
                      <div className="cc-iss">
                        {c.bank} · {records} record{records === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="cc-odds">
                      <span className={'pct ' + (odds == null ? 'dim' : '')}>
                        {odds == null ? '—' : `${odds}%`}
                      </span>
                      <span className="lbl">Approval</span>
                    </div>
                  </div>
                  <div className="cc-rows">
                    <span className="k">Annual fee</span>
                    <span className={'v fee-' + feeTone(c.annual_fee)}>
                      ${c.annual_fee ?? 0}
                    </span>
                    <span className="k">Reward type</span>
                    <span className="v">{rewardTypeLabel(c)}</span>
                    <span className="k">Top reward</span>
                    <span className="v">{formatTopReward(c)}</span>
                    <span className="k">Welcome bonus</span>
                    <span className="v">
                      {bonus.main}
                      {bonus.sub ? (
                        <span
                          style={{
                            display: 'block',
                            color: 'var(--muted)',
                            fontWeight: 400,
                            fontSize: 10.5,
                            marginTop: 2,
                          }}
                        >
                          {bonus.sub}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="cc-foot">
                    <span className="cc-foot-label">
                      {records === 0
                        ? 'No records yet'
                        : `${records} record${records === 1 ? '' : 's'}`}
                    </span>
                    <span className={'cat-tag ' + (archived ? 'archived' : '')}>
                      {archived ? 'Archived' : category}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="card-table-wrap">
            <table className="card-table">
              <thead>
                <tr>
                  <th>Card</th>
                  <th className="num hide-sm">Annual fee</th>
                  <th className="hide-sm">Reward type</th>
                  <th className="hide-md">Top reward</th>
                  <th className="hide-sm">Welcome bonus</th>
                  <th className="num ct-approval-col">Approval</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const odds = approvalOdds(c);
                  const records =
                    (c.approved_count ?? 0) + (c.rejected_count ?? 0);
                  const archived = !c.accepting_applications;
                  const bonus = formatBonus(c);
                  const feeLabel = `$${c.annual_fee ?? 0}`;
                  return (
                    <tr key={c.slug}>
                      <td>
                        <Link href={`/card/${c.slug}`} className="ct-card">
                          <div className="ct-thumb">
                            <CardImage
                              cardImageLink={c.card_image_link}
                              alt=""
                              fill
                              sizes="48px"
                              style={{ objectFit: 'cover' }}
                            />
                          </div>
                          <div className="ct-meta">
                            <div className="ct-name">{c.card_name}</div>
                            <div className="ct-iss">
                              {c.bank}
                              {archived ? ' · archived' : ''}
                            </div>
                            <div className="ct-mobile-summary">
                              <span className={'ct-mobile-fee fee-' + feeTone(c.annual_fee)}>
                                {feeLabel}
                              </span>
                              <span className="ct-mobile-sep">·</span>
                              <span>{rewardTypeLabel(c)}</span>
                              {bonus.main !== '—' && (
                                <>
                                  <span className="ct-mobile-sep">·</span>
                                  <span>{bonus.main}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className={'num hide-sm fee-' + feeTone(c.annual_fee)}>
                        {feeLabel}
                      </td>
                      <td className="hide-sm">{rewardTypeLabel(c)}</td>
                      <td className="hide-md">{formatTopReward(c)}</td>
                      <td className="hide-sm">
                        {bonus.main}
                        {bonus.sub ? (
                          <span className="ct-sub">{bonus.sub}</span>
                        ) : null}
                      </td>
                      <td className="num ct-approval-col">
                        {odds == null ? (
                          <span className="muted">—</span>
                        ) : (
                          <>
                            <span className="ct-odds">{odds}%</span>
                            <span className="ct-sub">({records})</span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <V2Footer />
    </div>
  );
}
