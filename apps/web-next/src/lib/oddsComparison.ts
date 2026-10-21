import type { CheckOddsCard } from './api';

// Also handles responses from an older API during a rolling deployment.
// Missing sample counts must not revive the old null-as-zero comparisons.
export function normalizeOddsCard(card: CheckOddsCard): CheckOddsCard {
  const result = { ...card };
  for (const field of ['credit_score', 'income', 'length_credit'] as const) {
    const count = card[`${field}_sample_count`];
    const median = card[`median_${field}`];
    const above = card[`above_${field}`];
    const valid = Number.isInteger(count) && count >= 5 &&
      typeof median === 'number' && Number.isFinite(median) && typeof above === 'boolean';
    result[`${field}_sample_count`] = Number.isInteger(count) && count >= 0 ? count : 0;
    result[`median_${field}`] = valid ? median : null;
    result[`above_${field}`] = valid ? above : null;
  }
  const comparisons = [result.above_credit_score, result.above_income, result.above_length_credit];
  result.available_metrics = comparisons.filter(value => value !== null).length;
  result.match_score = comparisons.filter(value => value === true).length;
  result.has_enough_data = result.available_metrics === 3;
  return result;
}

export function sortOddsComparisons(a: CheckOddsCard, b: CheckOddsCard): number {
  return b.available_metrics - a.available_metrics || b.match_score - a.match_score || b.total_records - a.total_records;
}

export function summarizeOddsComparisons(cards: CheckOddsCard[]) {
  const complete = cards.filter(c => c.available_metrics === 3);
  return {
    three: complete.filter(c => c.match_score === 3).length,
    two: complete.filter(c => c.match_score === 2).length,
    one: complete.filter(c => c.match_score === 1).length,
    zero: complete.filter(c => c.match_score === 0).length,
    partial: cards.filter(c => c.available_metrics > 0 && c.available_metrics < 3).length,
    noData: cards.filter(c => c.available_metrics === 0).length,
  };
}

export function formatStatsDate(value: string | null | undefined): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }) : 'unknown';
}
