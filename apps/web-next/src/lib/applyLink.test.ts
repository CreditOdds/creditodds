import { describe, expect, it } from 'vitest';
import {
  REFLECT_TEST_APPLY_LINK,
  bestCardDetailHref,
  resolveApplyLink,
} from './applyLink';

const DEFAULT_REFLECT_URL = 'https://creditcards.wellsfargo.com/reflect-visa-credit-card';

describe('Wells Fargo Reflect best-page apply-link test', () => {
  it('marks only the Reflect link on the targeted best page', () => {
    expect(bestCardDetailHref('wells-fargo-reflect', 'best-0-apr-cards')).toBe(
      '/card/wells-fargo-reflect?from=best-0-apr-cards',
    );
    expect(bestCardDetailHref('wells-fargo-reflect', 'best-balance-transfer-cards')).toBe(
      '/card/wells-fargo-reflect',
    );
    expect(bestCardDetailHref('chase-slate-edge', 'best-0-apr-cards')).toBe(
      '/card/chase-slate-edge',
    );
  });

  it('uses the exact Acclaim link for the targeted cohort during the test', () => {
    expect(resolveApplyLink({
      cardSlug: 'wells-fargo-reflect',
      defaultUrl: DEFAULT_REFLECT_URL,
      source: 'best-0-apr-cards',
      now: new Date('2026-07-15T12:00:00.000Z'),
    })).toBe(REFLECT_TEST_APPLY_LINK);
  });

  it('keeps the regular link for direct and unrelated traffic', () => {
    const direct = resolveApplyLink({
      cardSlug: 'wells-fargo-reflect',
      defaultUrl: DEFAULT_REFLECT_URL,
      source: null,
      now: new Date('2026-07-15T12:00:00.000Z'),
    });

    expect(direct).toContain('creditcards.wellsfargo.com/reflect-visa-credit-card');
    expect(direct).toContain('utm_source=creditodds');
  });

  it('automatically expires the override after seven days', () => {
    const expired = resolveApplyLink({
      cardSlug: 'wells-fargo-reflect',
      defaultUrl: DEFAULT_REFLECT_URL,
      source: 'best-0-apr-cards',
      now: new Date('2026-07-21T02:40:00.000Z'),
    });

    expect(expired).toContain('creditcards.wellsfargo.com/reflect-visa-credit-card');
    expect(expired).not.toBe(REFLECT_TEST_APPLY_LINK);
  });
});
