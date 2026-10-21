import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CheckOddsCard } from './api';
import { normalizeOddsCard, sortOddsComparisons, summarizeOddsComparisons } from './oddsComparison';
import { MedianIndicator, MobileIndicator } from '@/app/check-odds/ComparisonIndicators';
const full = {
  card_id: 1, total_records: 20,
  credit_score_sample_count: 5, median_credit_score: 700, above_credit_score: true,
  income_sample_count: 5, median_income: 50000, above_income: true,
  length_credit_sample_count: 5, median_length_credit: 3, above_length_credit: true,
} as CheckOddsCard;

describe('comparison data and display', () => {
  it('never classifies partial 1/1 data as 1/3 or 3/3', () => {
    const partial = normalizeOddsCard({ ...full, income_sample_count: 4, median_length_credit: null });
    expect(partial).toMatchObject({ available_metrics: 1, match_score: 1, above_income: null, above_length_credit: null });
    expect(summarizeOddsComparisons([partial])).toEqual({ three: 0, two: 0, one: 0, zero: 0, partial: 1, noData: 0 });
  });
  it('does not trust an older API response with no sample sizes', () => {
    const legacy = { ...full, match_score: 3, has_enough_data: true };
    for (const key of ['credit_score_sample_count', 'income_sample_count', 'length_credit_sample_count'] as const) delete (legacy as Partial<CheckOddsCard>)[key];
    expect(normalizeOddsCard(legacy)).toMatchObject({ available_metrics: 0, match_score: 0, has_enough_data: false, median_income: null });
  });
  it('ranks complete observations before partial observations', () => {
    const complete = normalizeOddsCard({ ...full, above_income: false, above_credit_score: false, above_length_credit: false });
    const partial = normalizeOddsCard({ ...full, income_sample_count: 0 });
    expect([partial, complete].sort(sortOddsComparisons)).toEqual([complete, partial]);
  });
  it.each([MedianIndicator, MobileIndicator])('renders missing fields neutrally on desktop and mobile', Component => {
    const html = renderToStaticMarkup(createElement(Component, { label: 'Income', median: null, isAbove: null, sampleCount: 2 }));
    expect(html.toLowerCase()).toContain('insufficient data');
    expect(html).toContain('2 reports');
    expect(html).not.toMatch(/Below|text-red|text-green|\$0/);
  });
  it('shows a valid zero median and equality correctly', () => {
    const html = renderToStaticMarkup(createElement(MedianIndicator, { median: 0, isAbove: true, sampleCount: 5, isCurrency: true }));
    expect(html).toContain('At or above');
    expect(html).toContain('$0');
    expect(html).toContain('5 reports');
  });
});
