'use client';

import type { CardRecord } from '@/lib/api';

interface CardRecordsTableProps {
  records: CardRecord[];
}

function formatMonth(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
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

export default function CardRecordsTable({ records }: CardRecordsTableProps) {
  if (records.length === 0) {
    return (
      <div className="cj-verdict" style={{ marginTop: 16 }}>
        No data points to show yet.
      </div>
    );
  }

  return (
    <div className="cj-records-wrap" style={{ marginTop: 16 }}>
      <div className="cj-records-scroll">
        <table className="cj-records-table">
          <thead>
            <tr>
              <th>Result</th>
              <th>Credit Score</th>
              <th>Income</th>
              <th>History</th>
              <th title="Hard inquiries in the last 3 / 12 / 24 months">Inq. 3/12/24</th>
              <th>Bank cust.</th>
              <th>Outcome</th>
              <th>Applied</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
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
