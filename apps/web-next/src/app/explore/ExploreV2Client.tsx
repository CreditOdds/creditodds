'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { V2Footer } from '@/components/landing-v2/Chrome';
import type { Card, Reward } from '@/lib/api';
import { categoryLabels, CategoryIcon, pickHeadlineReward } from '@/lib/cardDisplayUtils';
import { cardMatchesSearch } from '@/lib/searchAliases';
import '../landing.css';

interface ExploreV2ClientProps {
  cards: Card[];
  trendingViews?: Record<number, number>;
}

type SortKey = 'trending' | 'records' | 'fee' | 'bonus' | 'approval';
type SortDir = 'asc' | 'desc';
type ViewMode = 'grid' | 'table';
type RewardTypeFilter = 'all' | 'cashback' | 'points' | 'miles';
type FeeBucket = 'all' | 'free' | 'low' | 'mid' | 'high';

const REWARD_TYPES: [RewardTypeFilter, string, string | null][] = [
  ['all', 'All', null],
  ['cashback', 'Cashback', '💵'],
  ['points', 'Points', '✨'],
  ['miles', 'Miles', '✈️'],
];

const FEE_BUCKETS: [FeeBucket, string][] = [
  ['all', 'Any'],
  ['free', 'No fee'],
  ['low', 'Under $100'],
  ['mid', '$100–$250'],
  ['high', 'Over $250'],
];

function feeMatchesBucket(fee: number | undefined, bucket: FeeBucket): boolean {
  if (bucket === 'all') return true;
  const f = fee ?? 0;
  if (bucket === 'free') return f === 0;
  if (bucket === 'low') return f > 0 && f < 100;
  if (bucket === 'mid') return f >= 100 && f <= 250;
  if (bucket === 'high') return f > 250;
  return true;
}

function SortChevron({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      className={'sort-chevron' + (active ? ' sort-chevron-active' : '')}
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      {active && dir === 'asc' ? (
        <polyline points="18 15 12 9 6 15" />
      ) : active && dir === 'desc' ? (
        <polyline points="6 9 12 15 18 9" />
      ) : (
        <>
          <polyline points="18 9 12 3 6 9" />
          <polyline points="6 15 12 21 18 15" />
        </>
      )}
    </svg>
  );
}

function IssuerDropdown({
  banks,
  selected,
  onChange,
}: {
  banks: { name: string; count: number }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const label = selected.size === 0 ? 'Issuer' : `Issuer (${selected.size})`;

  function toggle(bank: string) {
    const next = new Set(selected);
    if (next.has(bank)) next.delete(bank);
    else next.add(bank);
    onChange(next);
  }

  return (
    <div className="issuer-dropdown" ref={ref}>
      <button
        type="button"
        className={'filter-chip ' + (selected.size > 0 ? 'active' : '')}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="issuer-panel" role="listbox">
          {selected.size > 0 && (
            <button
              type="button"
              className="issuer-clear"
              onClick={() => onChange(new Set())}
            >
              Clear all
            </button>
          )}
          <div className="issuer-options">
            {banks.map((b) => (
              <label key={b.name} className="issuer-option">
                <input
                  type="checkbox"
                  checked={selected.has(b.name)}
                  onChange={() => toggle(b.name)}
                />
                <span className="issuer-name">{b.name}</span>
                <span className="issuer-count">{b.count}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function feeTone(fee: number | undefined): 'none' | 'mid' | 'high' {
  if (!fee) return 'none';
  if (fee >= 200) return 'high';
  return 'mid';
}

function cardCategory(card: Card): 'Travel' | 'Business' | null {
  const explicit = (card.category || '').toLowerCase();
  if (explicit.includes('business')) return 'Business';
  if (explicit.includes('travel')) return 'Travel';

  const tags = (card.tags ?? []).map((t) => t.toLowerCase());
  if (/business/i.test(card.card_name)) return 'Business';
  if (tags.some((t) => t.includes('business'))) return 'Business';
  if (tags.some((t) => t.includes('travel') || t.includes('miles') || t.includes('airline') || t.includes('hotel'))) return 'Travel';

  if (card.reward_type === 'miles') return 'Travel';
  return null;
}

function approvalOdds(card: Card): number | null {
  const a = card.approved_count ?? 0;
  const r = card.rejected_count ?? 0;
  const t = a + r;
  if (t === 0) return null;
  return Math.round((a / t) * 100);
}

function oddsColor(odds: number): 'odds-green' | 'odds-amber' | 'odds-red' {
  if (odds >= 70) return 'odds-green';
  if (odds >= 40) return 'odds-amber';
  return 'odds-red';
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
  const pick = pickHeadlineReward(card.rewards);
  return pick?.reward ?? null;
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

function rewardTypeEmoji(card: Card): string | null {
  switch (card.reward_type) {
    case 'cashback':
      return '💵';
    case 'points':
      return '✨';
    case 'miles':
      return '✈️';
    default:
      return null;
  }
}

function RewardTypeCell({ card }: { card: Card }) {
  if (!card.reward_type) return <span className="muted">—</span>;
  const emoji = rewardTypeEmoji(card);
  return (
    <span className="ct-reward-type">
      {emoji && <span aria-hidden="true" className="ct-reward-type-icon">{emoji}</span>}
      <span className="ct-reward-type-label">{rewardTypeLabel(card)}</span>
    </span>
  );
}

function TopRewardCell({ card }: { card: Card }) {
  const top = topReward(card);
  if (!top) return <span className="muted">—</span>;
  const rate = top.unit === 'percent' ? `${top.value}%` : `${top.value}x`;
  const label = categoryLabels[top.category] || top.category;
  return (
    <span className="ct-top-reward">
      <CategoryIcon category={top.category} className="ct-top-reward-icon" />
      <span className="ct-top-reward-rate">{rate}</span>
      <span className="ct-top-reward-label">{label}</span>
    </span>
  );
}

export default function ExploreV2Client({ cards, trendingViews }: ExploreV2ClientProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setQuery(q);
  }, []);
  const [sort, setSort] = useState<SortKey>('trending');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [view, setView] = useState<ViewMode>('table');
  const [rewardType, setRewardType] = useState<RewardTypeFilter>('all');
  const [feeBucket, setFeeBucket] = useState<FeeBucket>('all');
  const [selectedBanks, setSelectedBanks] = useState<Set<string>>(new Set());
  const [businessOnly, setBusinessOnly] = useState(false);

  function handleColSort(col: SortKey) {
    const defaultDir: SortDir = col === 'fee' ? 'asc' : 'desc';
    if (sort === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(col);
      setSortDir(defaultDir);
    }
  }

  const totalCount = useMemo(
    () => cards.filter((c) => includeArchived || c.accepting_applications).length,
    [cards, includeArchived]
  );

  const hasActiveFilters =
    query.trim() !== '' ||
    rewardType !== 'all' ||
    feeBucket !== 'all' ||
    selectedBanks.size > 0 ||
    businessOnly ||
    includeArchived;

  function clearFilters() {
    setQuery('');
    setRewardType('all');
    setFeeBucket('all');
    setSelectedBanks(new Set());
    setBusinessOnly(false);
    setIncludeArchived(false);
  }

  const banksList = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of cards) {
      if (!includeArchived && !c.accepting_applications) continue;
      if (!c.bank) continue;
      counts[c.bank] = (counts[c.bank] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cards, includeArchived]);

  const filtered = useMemo(() => {
    const q = query.trim();
    const pool = cards.filter((c) => {
      if (!includeArchived && !c.accepting_applications) return false;
      if (businessOnly && cardCategory(c) !== 'Business') return false;
      if (rewardType !== 'all' && c.reward_type !== rewardType) return false;
      if (!feeMatchesBucket(c.annual_fee, feeBucket)) return false;
      if (selectedBanks.size > 0 && !selectedBanks.has(c.bank)) return false;
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
    } else if (sort === 'records') {
      sorted.sort(
        (a, b) =>
          (b.approved_count ?? 0) +
          (b.rejected_count ?? 0) -
          ((a.approved_count ?? 0) + (a.rejected_count ?? 0))
      );
    } else if (sort === 'fee') {
      sorted.sort((a, b) =>
        sortDir === 'asc'
          ? (a.annual_fee ?? 0) - (b.annual_fee ?? 0)
          : (b.annual_fee ?? 0) - (a.annual_fee ?? 0)
      );
    } else if (sort === 'approval') {
      sorted.sort((a, b) => {
        const ao = approvalOdds(a) ?? (sortDir === 'desc' ? -1 : 101);
        const bo = approvalOdds(b) ?? (sortDir === 'desc' ? -1 : 101);
        return sortDir === 'desc' ? bo - ao : ao - bo;
      });
    } else if (sort === 'bonus') {
      sorted.sort((a, b) => {
        const av = a.signup_bonus?.value ?? (sortDir === 'desc' ? -1 : Infinity);
        const bv = b.signup_bonus?.value ?? (sortDir === 'desc' ? -1 : Infinity);
        return sortDir === 'desc' ? bv - av : av - bv;
      });
    }
    return sorted;
  }, [cards, query, sort, sortDir, includeArchived, trendingViews, rewardType, feeBucket, selectedBanks, businessOnly]);

  return (
    <div className="landing-v2">
      <section className="page-hero wrap">
        <h1 className="page-title">
          Every card. <em>Everything you need.</em>
        </h1>
        <p className="page-sub">
          The complete credit card catalog — rewards, fees, welcome bonuses, and real
          approval odds from the community. No affiliate rankings, just the data.
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
            <span className="filter-group-label">Type</span>
            {REWARD_TYPES.map(([k, l, emoji]) => (
              <button
                key={k}
                type="button"
                className={'filter-chip ' + (rewardType === k ? 'active' : '')}
                onClick={() => setRewardType(k)}
              >
                {emoji && <span aria-hidden="true">{emoji}</span>}
                {l}
              </button>
            ))}
          </div>
          <div className="filter-chip-row">
            <span className="filter-group-label">Fee</span>
            {FEE_BUCKETS.map(([k, l]) => (
              <button
                key={k}
                type="button"
                className={'filter-chip ' + (feeBucket === k ? 'active' : '')}
                onClick={() => setFeeBucket(k)}
              >
                {l}
              </button>
            ))}
            <IssuerDropdown
              banks={banksList}
              selected={selectedBanks}
              onChange={setSelectedBanks}
            />
          </div>
          <div className="filter-bottom-row">
            <div className="filter-chip-row">
              <span className="filter-group-label">Sort</span>
              {(
                [
                  ['trending', 'Trending'],
                  ['records', 'Records'],
                ] as [SortKey, string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  className={'filter-chip ' + (sort === k ? 'active' : '')}
                  onClick={() => setSort(k)}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="filter-chip-row">
              <span className="filter-group-label">Show</span>
              <button
                type="button"
                className={'filter-chip ' + (businessOnly ? 'active' : '')}
                onClick={() => setBusinessOnly((v) => !v)}
              >
                Business only
              </button>
              <button
                type="button"
                className={'filter-chip ' + (includeArchived ? 'active' : '')}
                onClick={() => setIncludeArchived((v) => !v)}
              >
                Archived
              </button>
            </div>
          </div>
        </div>

        <div className="filter-results-bar">
          <span className="filter-results-count">
            Showing {filtered.length} of {totalCount} cards
          </span>
          {hasActiveFilters && (
            <button type="button" className="filter-clear-btn" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div
            style={{
              padding: '80px 0',
              textAlign: 'center',
              color: 'var(--muted)',
              fontFamily: "'Inter', sans-serif",
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
              const archived = !c.accepting_applications;
              const bonus = formatBonus(c);
              return (
                <Link key={c.slug} href={`/card/${c.slug}`} className="cc">
                  <div className="cc-top">
                    <div className="cc-thumb">
                      <CardImage
                        cardImageLink={c.card_image_link}
                        alt={c.card_name}
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
                      <span className={'pct ' + (odds == null ? 'dim' : oddsColor(odds))}>
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
                    <span className="v"><RewardTypeCell card={c} /></span>
                    <span className="k">Top reward</span>
                    <span className="v"><TopRewardCell card={c} /></span>
                    <span className="k">Welcome bonus</span>
                    <span className="v">
                      {bonus.main}
                      {bonus.sub ? (
                        <span className="bonus-sub">
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
                    {archived && (
                      <span className="cat-tag archived">Archived</span>
                    )}
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
                  <th
                    className={'num hide-sm sort-th' + (sort === 'fee' ? ' sort-th-active' : '')}
                    onClick={() => handleColSort('fee')}
                  >
                    Annual fee
                    <SortChevron active={sort === 'fee'} dir={sortDir} />
                  </th>
                  <th className="hide-sm">Reward type</th>
                  <th className="hide-md">Top reward</th>
                  <th
                    className={'hide-sm sort-th' + (sort === 'bonus' ? ' sort-th-active' : '')}
                    onClick={() => handleColSort('bonus')}
                  >
                    Welcome bonus
                    <SortChevron active={sort === 'bonus'} dir={sortDir} />
                  </th>
                  <th
                    className={'num ct-approval-col sort-th' + (sort === 'approval' ? ' sort-th-active' : '')}
                    onClick={() => handleColSort('approval')}
                  >
                    Approval
                    <SortChevron active={sort === 'approval'} dir={sortDir} />
                  </th>
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
                              alt={c.card_name}
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
                      <td className="hide-sm"><RewardTypeCell card={c} /></td>
                      <td className="hide-md"><TopRewardCell card={c} /></td>
                      <td className="hide-sm">
                        {bonus.main}
                        {bonus.sub ? (
                          <span className="bonus-sub">{bonus.sub}</span>
                        ) : null}
                      </td>
                      <td className="num ct-approval-col">
                        {odds == null ? (
                          <span className="muted">—</span>
                        ) : (
                          <>
                            <span className={'ct-odds ' + oddsColor(odds)}>{odds}%</span>
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
