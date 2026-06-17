'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  bankMap: Record<string, string>;
}

type FilterKey = 'all' | 'fee' | 'bonus' | 'apr' | 'apps';
type DirKey = 'all' | 'pos' | 'neg';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fee', label: 'Annual fee' },
  { key: 'bonus', label: 'Sign-up bonus' },
  { key: 'apr', label: 'APR' },
  { key: 'apps', label: 'Applications' },
];

const FIELD_LABELS: Record<string, string> = {
  accepting_applications: 'Applications',
  annual_fee: 'Annual fee',
  signup_bonus_value: 'Sign-up bonus',
  apr_min: 'APR min',
  apr_max: 'APR max',
  intro_apr_purchase_months: 'Intro APR (purchases)',
  intro_apr_bt_months: 'Intro APR (balance transfer)',
};

const HIGHER_IS_BAD = new Set(['annual_fee', 'apr_min', 'apr_max']);

function fieldGroup(field: string): FilterKey {
  if (field === 'annual_fee') return 'fee';
  if (field === 'signup_bonus_value') return 'bonus';
  if (field === 'apr_min' || field === 'apr_max') return 'apr';
  if (field === 'intro_apr_purchase_months' || field === 'intro_apr_bt_months') return 'apr';
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
  if (field === 'apr_min' || field === 'apr_max') {
    if (!Number.isNaN(num)) return `${num}%`;
    return value;
  }
  if (field === 'intro_apr_purchase_months' || field === 'intro_apr_bt_months') {
    if (!Number.isNaN(num)) return `${num} mo`;
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

function formatDayShort(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function CardWireV2Client({ entries, slugMap, bonusTypeMap, bankMap }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [issuer, setIssuer] = useState('all');
  const [dir, setDir] = useState<DirKey>('all');
  const [page, setPage] = useState(1);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: entries.length, fee: 0, bonus: 0, apr: 0, apps: 0 };
    for (const e of entries) {
      const g = fieldGroup(e.field);
      if (g !== 'all') c[g]++;
    }
    return c;
  }, [entries]);

  const supersededIds = useMemo(() => {
    const seen = new Set<string>();
    const superseded = new Set<number>();
    const sorted = [...entries].sort(
      (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
    );
    for (const e of sorted) {
      const key = `${e.card_name}::${e.field}`;
      if (seen.has(key)) {
        superseded.add(e.id);
      } else {
        seen.add(key);
      }
    }
    return superseded;
  }, [entries]);

  const issuers = useMemo(() => {
    const tally = new Map<string, number>();
    for (const e of entries) {
      const bank = bankMap[e.card_name];
      if (!bank) continue;
      tally.set(bank, (tally.get(bank) || 0) + 1);
    }
    return [...tally.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ value: name, label: name, count }));
  }, [entries, bankMap]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filter !== 'all' && fieldGroup(e.field) !== filter) return false;
      if (issuer !== 'all' && bankMap[e.card_name] !== issuer) return false;
      if (dir !== 'all' && changeDirection(e.field, e.old_value, e.new_value) !== dir) return false;
      return true;
    });
  }, [entries, filter, issuer, dir, bankMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const latestTs = entries[0]?.changed_at;
  const latestShort = latestTs ? formatDayShort(latestTs) : '—';

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
    <div className="landing-v2 wire-v2">
      {/* Terminal strip — dark bar with breadcrumb + status */}
      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <Link href="/news" className="cj-crumb">News</Link>
          <span className="cj-sep">/</span>
          <span className="cj-crumb cj-crumb-current" aria-current="page">
            Wire
          </span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span>
            <span className="cj-status-dot" />
            live · last update {latestShort}
          </span>
        </div>
      </div>

      <main className="cj-main wire-main">
        {/* Snapshot — title + sub, with follow callout on the right */}
        <div className="cj-snapshot wire-snapshot has-follow">
          <div className="wire-snapshot-text">
            <h1 className="cj-snapshot-h1">
              The wire. <em>Every change.</em>
            </h1>
            <p className="wire-snapshot-sub">
              A chronological feed of every credit-card change we track — annual
              fees, sign-up bonuses, APR shifts, and application status.
            </p>
          </div>
          <a
            className="wire-follow"
            href="https://x.com/card_wire"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="wire-follow-copy">
              <span className="wire-follow-handle">
                <svg className="wire-follow-x" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"
                  />
                </svg>
                @card_wire
              </span>
              <span className="wire-follow-sub">Every change, the moment it posts</span>
            </span>
            <span className="wire-follow-btn">Follow</span>
          </a>
        </div>

        {/* Sticky filter toolbar — segmented control + issuer select + direction */}
        <div className="wire-bar-wrap">
          <div className="wire-bar">
            <div className="wire-bar-seg" role="group" aria-label="Change type">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={'wire-bar-seg-btn' + (filter === f.key ? ' active' : '')}
                  aria-pressed={filter === f.key}
                  onClick={() => {
                    setFilter(f.key);
                    setPage(1);
                  }}
                >
                  {f.label}
                  <span className="wire-bar-seg-count">{counts[f.key]}</span>
                </button>
              ))}
            </div>
            <span className="wire-bar-divider" aria-hidden="true" />
            <IssuerSelect
              issuers={issuers}
              total={entries.length}
              value={issuer}
              onChange={(v) => {
                setIssuer(v);
                setPage(1);
              }}
            />
            <span className="wire-bar-divider" aria-hidden="true" />
            <div className="wire-bar-dir" role="group" aria-label="Change direction">
              <button
                type="button"
                className={'wire-bar-dir-btn both' + (dir === 'all' ? ' active' : '')}
                aria-pressed={dir === 'all'}
                onClick={() => {
                  setDir('all');
                  setPage(1);
                }}
              >
                Both
              </button>
              <button
                type="button"
                className={'wire-bar-dir-btn up' + (dir === 'pos' ? ' active' : '')}
                aria-pressed={dir === 'pos'}
                onClick={() => {
                  setDir('pos');
                  setPage(1);
                }}
              >
                ↑ Better
              </button>
              <button
                type="button"
                className={'wire-bar-dir-btn down' + (dir === 'neg' ? ' active' : '')}
                aria-pressed={dir === 'neg'}
                onClick={() => {
                  setDir('neg');
                  setPage(1);
                }}
              >
                ↓ Worse
              </button>
            </div>
            <span className="wire-bar-right">
              <span className="wire-bar-dot" aria-hidden="true" />
              {filtered.length} change{filtered.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="cj-main-content">
          {filtered.length === 0 ? (
            <div className="wire-empty">No changes match this filter yet.</div>
          ) : (
            <div className="wire-feed" role="table" aria-label="Card wire change feed">
              <div className="wire-feed-head" role="row">
                <span role="columnheader">Card</span>
                <span role="columnheader" className="hide-sm">Field</span>
                <span role="columnheader" className="hide-sm">Change</span>
              </div>
              {grouped.map((group) => (
                <GroupRows
                  key={group.date}
                  date={group.date}
                  entries={group.entries}
                  slugMap={slugMap}
                  bonusTypeMap={bonusTypeMap}
                  supersededIds={supersededIds}
                />
              ))}
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
      </main>
      <V2Footer />
    </div>
  );
}

function IssuerSelect({
  issuers,
  total,
  value,
  onChange,
}: {
  issuers: { value: string; label: string; count: number }[];
  total: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(ev: MouseEvent) {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const options = [{ value: 'all', label: 'Every issuer', count: total }, ...issuers];
  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <span className="wire-bar-select" ref={ref}>
      <button
        type="button"
        className={
          'wire-bar-select-btn' + (open ? ' open' : '') + (value !== 'all' ? ' set' : '')
        }
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="k">Issuer</span>
        {current.label}
        <span className="caret" aria-hidden="true">
          ▼
        </span>
      </button>
      {open && (
        <span className="wire-bar-menu" role="listbox" aria-label="Issuer">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={'wire-bar-mi' + (o.value === value ? ' sel' : '')}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              <span className="n">{o.count}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function GroupRows({
  date,
  entries,
  slugMap,
  bonusTypeMap,
  supersededIds,
}: {
  date: string;
  entries: CardWireEntry[];
  slugMap: Record<string, string>;
  bonusTypeMap: Record<string, string>;
  supersededIds: Set<number>;
}) {
  return (
    <>
      <div className="wire-day" role="row">
        <span className="wire-day-date">{date}</span>
        <span className="wire-day-count">
          {entries.length} change{entries.length === 1 ? '' : 's'}
        </span>
      </div>
      {entries.map((entry) => {
        const slug = slugMap[entry.card_name];
        const bonusType = bonusTypeMap[entry.card_name];
        const group = fieldGroup(entry.field);
        const label = FIELD_LABELS[entry.field] ?? entry.field;
        const oldFmt = formatValue(entry.field, entry.old_value, bonusType);
        const newFmt = formatValue(entry.field, entry.new_value, bonusType);
        const dir = changeDirection(entry.field, entry.old_value, entry.new_value);
        const isSuperseded = supersededIds.has(entry.id);
        const cardInner = (
          <span className="wire-card">
            <span className="wire-thumb">
              <CardImage
                cardImageLink={entry.card_image_link}
                alt={entry.card_name}
                fill
                sizes="40px"
                style={{ objectFit: 'cover' }}
              />
            </span>
            <span className="wire-card-name">{entry.card_name}</span>
          </span>
        );
        const fieldChip = (
          <span className={'wire-field-chip ' + group}>{label}</span>
        );
        const changeBlock = (
          <span className={'wire-change ' + dir}>
            <span className="old">{oldFmt}</span>
            <span className="arrow" aria-hidden="true">→</span>
            <span className="new">{newFmt}</span>
            {isSuperseded && (
              <span className="wire-superseded-tag" title="A newer change exists for this field">
                superseded
              </span>
            )}
          </span>
        );
        return (
          <div
            key={entry.id}
            className={'wire-row' + (isSuperseded ? ' superseded' : '')}
            role="row"
          >
            <span className="wire-row-card" role="cell">
              {slug ? (
                <Link href={`/card/${slug}`} className="wire-card-link">
                  {cardInner}
                </Link>
              ) : (
                cardInner
              )}
              <div className="wire-row-mobile">
                {fieldChip}
                {changeBlock}
              </div>
            </span>
            <span className="wire-row-field hide-sm" role="cell">{fieldChip}</span>
            <span className="wire-row-change hide-sm" role="cell">{changeBlock}</span>
          </div>
        );
      })}
    </>
  );
}
