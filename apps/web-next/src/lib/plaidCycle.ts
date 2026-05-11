// Compute the current statement cycle window for a credit card account.
//
// Plaid Liabilities gives us `last_statement_issue_date` (when the last
// statement closed). The current cycle starts the next day and ends ~30 days
// later — most issuers use 28-31 day cycles. We use:
//   cycle_start = last_statement_issue_date + 1 day
//   cycle_end   = next_payment_due_date - 21 days  (typical grace window)
//                fallback: cycle_start + 30 days
//
// If we have no liabilities at all (account isn't a credit card or Plaid
// hasn't prepared the data), fall back to the calendar month so callers
// always get *some* window to filter against.

export interface CycleWindow {
  start: Date;
  end: Date;
  source: 'liabilities' | 'recent_90d';
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

// Stale liabilities (>60 days old) → treat as missing. A real cycle is ~30
// days, so anything older can't be the *current* cycle. Plaid sandbox returns
// 2019 dates which trip this constantly.
//
// Fallback window is 90 days rolling. Calendar month was too narrow:
//   - users who connect mid-month after the prior statement closed see ~nothing
//   - sandbox synthesizes ~90 days of historical txns ending today
//   - 90 days comfortably contains a quarterly cap period
// The frontend slices this further per-cap by cap_period (monthly/quarterly).
const STALE_LIABILITY_DAYS = 60;
const FALLBACK_WINDOW_DAYS = 90;

export function currentCycle(
  lastStatementIssueDate: string | null,
  nextPaymentDueDate: string | null,
  now: Date = new Date()
): CycleWindow {
  if (lastStatementIssueDate) {
    const lastClose = new Date(lastStatementIssueDate + 'T00:00:00Z');
    const ageDays = (now.getTime() - lastClose.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays <= STALE_LIABILITY_DAYS) {
      const start = addDays(lastClose, 1);
      let end: Date;
      if (nextPaymentDueDate) {
        end = addDays(new Date(nextPaymentDueDate + 'T00:00:00Z'), -21);
        if (end <= start) end = addDays(start, 30);
      } else {
        end = addDays(start, 30);
      }
      return { start, end, source: 'liabilities' };
    }
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = addDays(today, -FALLBACK_WINDOW_DAYS);
  const end = addDays(today, 1);
  return { start, end, source: 'recent_90d' };
}

export function isInCycle(transactionDate: string, cycle: CycleWindow): boolean {
  const d = new Date(transactionDate + 'T00:00:00Z');
  return d >= cycle.start && d < cycle.end;
}

export function formatCycleRange(cycle: CycleWindow): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(cycle.start)} – ${fmt(cycle.end)}`;
}
