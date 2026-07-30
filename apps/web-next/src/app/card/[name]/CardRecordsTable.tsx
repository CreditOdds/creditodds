'use client';

import { useMemo, useState } from 'react';
import type { CardRecord } from '@/lib/api';

interface CardRecordsTableProps {
  records: CardRecord[];
}

function formatMonth(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  // timeZone: 'UTC' keeps SSR and client output identical — local-zone
  // formatting shifts the day for visitors west of UTC and breaks hydration.
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', timeZone: 'UTC' });
}

function formatInquiries(r: CardRecord): string {
  const parts = [r.inquiries_3, r.inquiries_12, r.inquiries_24];
  if (parts.every((p) => p === null || p === undefined)) return '—';
  return parts.map((p) => (p === null || p === undefined ? '?' : String(p))).join(' / ');
}

function formatCurrency(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return `$${n.toLocaleString()}`;
}

function formatYears(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return `${n} yr${n === 1 ? '' : 's'}`;
}

type SortDir = 'asc' | 'desc';

interface Column {
  key: string;
  label: string;
  title?: string;
  defaultDir: SortDir;
  getValue: (r: CardRecord) => number | string | null;
}

const COLUMNS: Column[] = [
  { key: 'result', label: 'Result', defaultDir: 'desc', getValue: (r) => r.result },
  { key: 'score', label: 'Credit Score', defaultDir: 'desc', getValue: (r) => r.credit_score },
  { key: 'income', label: 'Income', defaultDir: 'desc', getValue: (r) => r.listed_income },
  { key: 'history', label: 'History', defaultDir: 'desc', getValue: (r) => r.length_credit },
  {
    key: 'inquiries',
    label: 'Inq. 3/12/24',
    title: 'Hard inquiries in the last 3 / 12 / 24 months',
    defaultDir: 'asc',
    // Counts are tiny, so weighting orders the 3/12/24 triple
    // lexicographically as a single number; missing windows count as 0.
    getValue: (r) => {
      if ([r.inquiries_3, r.inquiries_12, r.inquiries_24].every((p) => p === null || p === undefined)) {
        return null;
      }
      return (r.inquiries_3 ?? 0) * 1_000_000 + (r.inquiries_12 ?? 0) * 1_000 + (r.inquiries_24 ?? 0);
    },
  },
  { key: 'bank', label: 'Bank cust.', defaultDir: 'desc', getValue: (r) => r.bank_customer },
  {
    key: 'outcome',
    label: 'Outcome',
    defaultDir: 'desc',
    getValue: (r) => (r.result === 1 ? r.starting_credit_limit : r.reason_denied || null),
  },
  { key: 'applied', label: 'Applied', defaultDir: 'desc', getValue: (r) => {
    const d = new Date(r.date_applied || r.submit_datetime);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  } },
];

export default function CardRecordsTable({ records }: CardRecordsTableProps) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return records;
    const col = COLUMNS.find((c) => c.key === sort.key);
    if (!col) return records;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...records].sort((ra, rb) => {
      const a = col.getValue(ra);
      const b = col.getValue(rb);
      // Missing values sink to the bottom regardless of direction.
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
      if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b) * dir;
      // Outcome mixes credit limits and denial reasons — keep limits ahead.
      return typeof a === 'number' ? -1 : 1;
    });
  }, [records, sort]);

  if (records.length === 0) {
    return (
      <div className="cj-verdict" style={{ marginTop: 16 }}>
        No data points to show yet.
      </div>
    );
  }

  const handleSort = (col: Column) => {
    setSort((prev) =>
      prev?.key === col.key
        ? { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key: col.key, dir: col.defaultDir },
    );
  };

  return (
    <div className="cj-records-wrap" style={{ marginTop: 16 }}>
      <div className="cj-records-scroll">
        <table className="cj-records-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <button
                      type="button"
                      className={`cj-records-sort${active ? ' is-active' : ''}`}
                      onClick={() => handleSort(col)}
                      title={col.title}
                    >
                      {col.label}
                      <span className="cj-records-sort-arrow" aria-hidden="true">
                        {active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const approved = r.result === 1;
              return (
                <tr key={r.record_id}>
                  <td>
                    <span className={`cj-records-pill ${approved ? 'is-approved' : 'is-denied'}`}>
                      {approved ? 'Approved' : 'Denied'}
                    </span>
                  </td>
                  <td className="num">{r.credit_score ?? '—'}</td>
                  <td className="num">{formatCurrency(r.listed_income)}</td>
                  <td className="num">{formatYears(r.length_credit)}</td>
                  <td className="num">{formatInquiries(r)}</td>
                  <td>
                    {r.bank_customer === null || r.bank_customer === undefined
                      ? '—'
                      : r.bank_customer
                        ? 'Yes'
                        : 'No'}
                  </td>
                  <td>
                    {approved
                      ? formatCurrency(r.starting_credit_limit)
                      : r.reason_denied || '—'}
                  </td>
                  <td>{formatMonth(r.date_applied || r.submit_datetime)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
