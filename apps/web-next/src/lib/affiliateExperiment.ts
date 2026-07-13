export const AFFILIATE_EXPERIMENT_ID = 'affiliate-cta-v1';

export const AFFILIATE_EXPERIMENT_VARIANTS = [
  'control',
  'checkout_plan',
  'reward_calculator',
  'sticky_bar',
] as const;

export type AffiliateExperimentVariant = typeof AFFILIATE_EXPERIMENT_VARIANTS[number];

// FNV-1a gives us a small deterministic assignment function. The anonymous
// identifier stays in localStorage and is never sent to the API; only the
// resulting experiment variant is recorded.
export function assignAffiliateExperimentVariant(visitorId: string): AffiliateExperimentVariant {
  let hash = 0x811c9dc5;
  const input = `${AFFILIATE_EXPERIMENT_ID}:${visitorId}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return AFFILIATE_EXPERIMENT_VARIANTS[(hash >>> 0) % AFFILIATE_EXPERIMENT_VARIANTS.length];
}
