// Server-side mirror of apps/web-next/src/lib/plaidCycle.ts.
// Compute the current statement cycle window for a credit card account.
// Falls back to calendar month when liabilities aren't available.

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// If the statement-issue-date is more than 60 days old, the liability data is
// stale (Plaid sandbox returns 2019 dates; real institutions occasionally
// publish stale data on dormant accounts). A real cycle is ~30 days, so a
// statement >60 days ago can't possibly be the *current* cycle.
//
// Fallback is a 90-day rolling window. Calendar month was too narrow:
//   - users who connect mid-month after the prior statement closed see little
//     or no data
//   - sandbox synthesizes ~90 days of historical txns ending today, so a
//     calendar-month window can land entirely *after* the synthetic data
//   - 90 days comfortably contains a quarterly cap period (Discover, Freedom)
// The frontend slices this further per-cap by cap_period (monthly/quarterly/etc).
const STALE_LIABILITY_DAYS = 60;
const FALLBACK_WINDOW_DAYS = 90;

function currentCycle(lastStatementIssueDate, nextPaymentDueDate, now = new Date()) {
  if (lastStatementIssueDate) {
    const lastClose = new Date(lastStatementIssueDate + 'T00:00:00Z');
    const ageDays = (now.getTime() - lastClose.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays <= STALE_LIABILITY_DAYS) {
      const start = addDays(lastClose, 1);
      let end;
      if (nextPaymentDueDate) {
        end = addDays(new Date(nextPaymentDueDate + 'T00:00:00Z'), -21);
        if (end <= start) end = addDays(start, 30);
      } else {
        end = addDays(start, 30);
      }
      return { start: toIsoDate(start), end: toIsoDate(end), source: 'liabilities' };
    }
  }
  const today = startOfDay(now);
  const start = addDays(today, -FALLBACK_WINDOW_DAYS);
  const end = addDays(today, 1);
  return { start: toIsoDate(start), end: toIsoDate(end), source: 'recent_90d' };
}

module.exports = { currentCycle };
