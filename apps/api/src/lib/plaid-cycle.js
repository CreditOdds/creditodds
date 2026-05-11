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

function currentCycle(lastStatementIssueDate, nextPaymentDueDate, now = new Date()) {
  if (lastStatementIssueDate) {
    const lastClose = new Date(lastStatementIssueDate + 'T00:00:00Z');
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
  const start = startOfMonth(now);
  const end = startOfMonth(addDays(start, 35));
  return { start: toIsoDate(start), end: toIsoDate(end), source: 'calendar_month' };
}

module.exports = { currentCycle };
