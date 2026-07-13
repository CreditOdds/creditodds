import { describe, expect, it } from 'vitest';
import {
  AFFILIATE_EXPERIMENT_VARIANTS,
  assignAffiliateExperimentVariant,
} from './affiliateExperiment';

describe('assignAffiliateExperimentVariant', () => {
  it('keeps a visitor in the same variant', () => {
    expect(assignAffiliateExperimentVariant('visitor-123')).toBe(
      assignAffiliateExperimentVariant('visitor-123'),
    );
  });

  it('only returns configured variants', () => {
    for (let index = 0; index < 100; index += 1) {
      expect(AFFILIATE_EXPERIMENT_VARIANTS).toContain(
        assignAffiliateExperimentVariant(`visitor-${index}`),
      );
    }
  });

  it('assigns a representative sample across all variants', () => {
    const assigned = new Set(
      Array.from({ length: 100 }, (_, index) => (
        assignAffiliateExperimentVariant(`sample-${index}`)
      )),
    );

    expect(assigned).toEqual(new Set(AFFILIATE_EXPERIMENT_VARIANTS));
  });
});
