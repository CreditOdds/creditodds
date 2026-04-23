'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { V2Footer } from '@/components/landing-v2/Chrome';
import type { CardWireEntry } from '@/lib/api';
import '../landing.css';

const PAGE_SIZE = 50;

interface Props {
  entries: CardWireEntry[];
  slugMap: Record<string, string>;
  bonusTypeMap: Record<string, string>;
}

type FilterKey = 'all' | 'fee' | 'bonus' | 'reward' | 'apr' | 'apps';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fee', label: 'Annual fee' },
  { key: 'bonus', label: 'Sign-up bonus' },
  { key: 'reward', label: 'Rewards' },
  { key: 'apr', label: 'APR' },
  { key: 'apps', label: 'Applications' },
];

const FIELD_LABELS: Record<string, string> = {
  accepting_applications: 'Applications',
  annual_fee: 'Annual fee',
  signup_bonus_value: 'Sign-up bonus',
  reward_top_rate: 'Top reward',
  apr_min: 'APR min',
  apr_max: 'APR max',
};

const HIGHER_IS_BAD = new Set(['annual_fee', 'apr_min', 'apr_max']);

function fieldGroup(field: string): FilterKey {
  if (field === 'annual_fee') return 'fee';
  if (field === 'signup_bonus_value') return 'bonus';
  if (field === 'reward_top_rate') return 'reward';
  if (field === 'apr_min' || field === 'apr_max') return 'apr';
  if (field === 'accepting_applications') return 'apps';
  return 'all';
}

function formatValue(
  field: string,
  value: string | null,
  bonusType?: string
): string {
  if (value === null || value === '') return '—';
  const num = parseFloat(value);
  if (field === 'accepting_applications') {
    if (value === '1' || value === 'true') return 'Accepting';
    if (value === '0' || value === 'false') return 'Not accepting';
    return value;
  }
  if (field === 'annual_fee') {
    if (!Number.isNaN(num)) return num === 0 ? '$0' : `$${num.toLocaleString()}`;
    return value;
  }
  if (field === 'signup_bonus_value') {
    if (!Number.isNaN(num)) {
      const suffix = bonusType ? ` ${bonusType}` : '';
      return `${num.toLocaleString()}${suffix}`;
    }
    return value;
  }
  if (field === 'reward_top_rate' || field === 'apr_min' || field === 'apr_max') {
    if (!Number.isNaN(num)) return `${num}%`;
    return value;
  }
  return value;
}

function changeDirection(
  field: string,
  oldValue: string | null,
  newValue: string | null
): 'pos' | 'neg' | 'neutral' {
  if (oldValue === null || newValue === null) return 'neutral';
  if (field === 'accepting_applications') {
    const was = oldValue === '1' || oldValue === 'true';
    const now = newValue === '1' || newValue === 'true';
    if (was && !now) return 'neg';
    if (!was && now) return 'pos';
    return 'neutral';
  }
  const oldNum = parseFloat(oldValue);
  const newNum = parseFloat(newValue);
  if (Number.isNaN(oldNum) || Number.isNaN(newNum)) return 'neutral';
  if (oldNum === newNum) return 'neutral';
  const increased = newNum > oldNum;
  if (HIGHER_IS_BAD.has(field)) return increased ? 'neg' : 'pos';
  return increased ? 'pos' : 'neg';
}

function formatDay(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function CardWireV2Client({ entries, slugMap, bonusTypeMap }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => fieldGroup(e.field) === filter);
  }, [entries, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const daysCovered = useMemo(() => {
    const days = new Set<string>();
    for (const e of entries) {
      const d = new Date(e.changed_at);
      if (!Number.isNaN(d.getTime())) {
        days.add(d.toISOString().slice(0, 10));
      }
    }
    return days.size;
  }, [entries]);

  const latestTs = entries[0]?.changed_at;
  const latestLabel = latestTs ? formatDay(latestTs) : '—';

  const grouped = useMemo(() => {
    const groups: { date: string; entries: CardWireEntry[] }[] = [];
    for (const entry of visible) {
      const date = formatDay(entry.changed_at);
      const last = groups[groups.length - 1];
      if (last && last.date === date) {
        last.entries.push(entry);
      } else {
        groups.push({ date, entries: [entry] });
      }
    }
    return groups;
  }, [visible]);

  function goPage(p: number) {
    setPage(p);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <div className="landing-v2">
      <section className="page-hero wrap">
        <div className="eyebrow">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent)',
            }}
          />
          <span>Card wire · live feed</span>
        </div>
        <h1 className="page-title">
          The wire. <em>Every change.</em>
        </h1>
        <p className="page-sub">
          A chronological feed of every credit-card change we track — annual fees,
          sign-up bonuses, reward rates, APR shifts, and application status.
        </p>
        <div className="wire-hero-meta">
          <span>
            <b>{entries.length.toLocaleString()}</b> changes
          </span>
          <span>·</span>
          <span>
            <b>{daysCovered}</b> days covered
          </span>
          <span>·</span>
          <span>Last update · <b>{latestLabel}</b></span>
        </div>
      </section>

      <div className="wrap">
        <div className="filter-bar" style={{ paddingTop: 20 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={'filter-chip ' + (filter === f.key ? 'active' : '')}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
            >
              {f.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {filtered.length} change{filtered.length === 1 ? '' : 's'}
          </span>
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
            No changes match this filter yet.
          </div>
        ) : (
          <div className="wire-table-wrap">
            <table className="wire-table">
              <thead>
                <tr>
                  <th>Card</th>
                  <th className="hide-sm">Field</th>
                  <th className="hide-sm">Change</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((group) => (
                  <GroupRows
                    key={group.date}
                    date={group.date}
                    entries={group.entries}
                    slugMap={slugMap}
                    bonusTypeMap={bonusTypeMap}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="wire-pager">
            <button
              type="button"
              onClick={() => goPage(safePage - 1)}
              disabled={safePage === 1}
            >
              ← Previous
            </button>
            <span>
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => goPage(safePage + 1)}
              disabled={safePage === totalPages}
            >
              Next →
            </button>
          </div>
        )}
      </div>
      <V2Footer />
    </div>
  );
}

function GroupRows({
  date,
  entries,
  slugMap,
  bonusTypeMap,
}: {
  date: string;
  entries: CardWireEntry[];
  slugMap: Record<string, string>;
  bonusTypeMap: Record<string, string>;
}) {
  return (
    <>
      <tr className="wire-date-row">
        <td colSpan={3}>
          {date}
          <span className="wire-date-count">
            {entries.length} change{entries.length === 1 ? '' : 's'}
          </span>
        </td>
      </tr>
      {entries.map((entry) => {
        const slug = slugMap[entry.card_name];
        const bonusType = bonusTypeMap[entry.card_name];
        const group = fieldGroup(entry.field);
        const label = FIELD_LABELS[entry.field] ?? entry.field;
        const oldFmt = formatValue(entry.field, entry.old_value, bonusType);
        const newFmt = formatValue(entry.field, entry.new_value, bonusType);
        const dir = changeDirection(entry.field, entry.old_value, entry.new_value);
        const cardContent = (
          <span className="wire-card">
            <span className="wc-thumb">
              <CardImage
                cardImageLink={entry.card_image_link}
                alt=""
                fill
                sizes="40px"
                style={{ objectFit: 'cover' }}
              />
            </span>
            <span className="wc-name">{entry.card_name}</span>
          </span>
        );
        const changeBlock = (
          <span className={'wire-change ' + dir}>
            <span className="old">{oldFmt}</span>
            <span className="arrow">→</span>
            <span className="new">{newFmt}</span>
          </span>
        );
        const fieldChip = (
          <span className={'wire-field-chip ' + group}>{label}</span>
        );
        return (
          <tr key={entry.id}>
            <td>
              {slug ? (
                <Link href={`/card/${slug}`} style={{ textDecoration: 'none' }}>
                  {cardContent}
                </Link>
              ) : (
                cardContent
              )}
              <div className="wire-mobile-summary">
                {fieldChip}
                {changeBlock}
              </div>
            </td>
            <td className="hide-sm">{fieldChip}</td>
            <td className="hide-sm">{changeBlock}</td>
          </tr>
        );
      })}
    </>
  );
}
