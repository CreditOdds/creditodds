import { describe, it, expect } from 'vitest';
import {
  formatBenefitValue,
  creditAmountLabel,
  amortizedAnnualValue,
  isMonetaryBenefit,
  spendableValue,
} from './cardDisplayUtils';

// `value_unit: "percent"` marks a benefit whose value is a RATE — a 20%
// inflight rebate, a 10% concessions rebate. formatBenefitValue had no
// percent branch, so it fell through to the dollar case and rendered
// "20%" as "$20" on every surface (card page, compare, wallet).
// Confirmed live on the Delta SkyMiles Blue page before the fix.
describe('formatBenefitValue', () => {
  it('renders a percent benefit as a rate, not dollars', () => {
    expect(
      formatBenefitValue({ name: 'x', value: 20, value_unit: 'percent', frequency: 'per_purchase' } as never)
    ).toBe('20%');
  });

  it('does not divide a percent rate down by frequency', () => {
    // A rate applies per purchase; dividing it by 12 would be meaningless.
    expect(
      formatBenefitValue({ name: 'x', value: 10, value_unit: 'percent', frequency: 'monthly' } as never)
    ).toBe('10%');
  });

  it('still renders dollars, points and miles as before', () => {
    expect(formatBenefitValue({ name: 'x', value: 250, frequency: 'annual' } as never)).toBe('$250');
    expect(formatBenefitValue({ name: 'x', value: 240, frequency: 'monthly' } as never)).toBe('$20');
    expect(
      formatBenefitValue({ name: 'x', value: 5000, value_unit: 'points', frequency: 'annual' } as never)
    ).toBe('5,000 points');
    expect(
      formatBenefitValue({ name: 'x', value: 10000, value_unit: 'miles', frequency: 'annual' } as never)
    ).toBe('10,000 miles');
  });
});

// A capped percentage rebate is not free money: "10% back up to $250" needs
// $2,500 of spend to realise $250. Modelling it as `value: 250` in USD put
// it in the "Statement credits" table and summed it into Total annual value
// as though it were a giveaway. Modelled as a percent it contributes 0.
describe('percent benefits never inflate annual value', () => {
  const rebate = { name: 'Venue Collection', value: 10, value_unit: 'percent', frequency: 'annual' } as never;

  it('is not treated as a monetary benefit', () => {
    expect(isMonetaryBenefit(rebate)).toBe(false);
  });

  it('contributes nothing to the annual credits rollup', () => {
    expect(amortizedAnnualValue(rebate)).toBe(0);
  });

  it('a real dollar credit still contributes', () => {
    expect(
      amortizedAnnualValue({ name: 'Hotel Credit', value: 250, frequency: 'annual' } as never)
    ).toBe(250);
  });
});

describe('spendableValue', () => {
  it('splits a dollar total across its cycle', () => {
    expect(spendableValue({ name: 'x', value: 240, frequency: 'monthly' } as never)).toBe(20);
    expect(spendableValue({ name: 'x', value: 200, frequency: 'quarterly' } as never)).toBe(50);
  });
});

// The store page (/best-card-for/<slug>) had its own copy of this formatter,
// which unconditionally prefixed "$". Samsung's 20%-off VIP Advantage
// membership rendered as "$20/yr" in production. It now lives here next to
// formatBenefitValue so the two cannot drift apart again.
describe('creditAmountLabel', () => {
  it('renders a percent benefit as a rate with no dollar sign or cadence', () => {
    expect(creditAmountLabel(20, 'annual', 'percent')).toBe('20%');
  });

  it('renders dollar credits with a per-year cadence', () => {
    expect(creditAmountLabel(300, 'annual')).toBe('$300/yr');
    expect(creditAmountLabel(120, 'monthly')).toBe('$120/yr');
    expect(creditAmountLabel(100, 'multi_year')).toBe('$100');
  });

  it('renders points and miles in their own unit', () => {
    expect(creditAmountLabel(5000, 'annual', 'points')).toBe('5,000 points/yr');
    expect(creditAmountLabel(10000, 'annual', 'miles')).toBe('10,000 miles/yr');
  });

  it('returns nothing for a zero-value perk', () => {
    expect(creditAmountLabel(0, 'annual')).toBe('');
  });
});
