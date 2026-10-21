import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { pickHeadlineReward } from './cardDisplayUtils';
import type { Reward } from './api';

const base: Reward = { category: 'everything_else', value: 1, unit: 'points_per_dollar' };
const dining: Reward = { category: 'dining', value: 3, unit: 'points_per_dollar' };
describe('honest reward headlines', () => {
  it.each(['chase-sapphire-preferred', 'chase-sapphire-reserve'])('does not generalize Lyft or Peloton offers on %s', slug => {
    const card = yaml.load(readFileSync(resolve('../../data/cards', `${slug}.yaml`), 'utf8')) as { rewards: Reward[] };
    const picked = pickHeadlineReward(card.rewards);
    expect(picked).not.toBeNull();
    expect(picked!.reward.category).not.toMatch(/transit|sporting_goods/);
    expect(picked!.reward.value).toBeLessThanOrEqual(3);
  });
  it.each([
    { merchant_gate: ['lyft'] }, { merchant_specific: true },
    { expires: '2020-01-01' }, { expires: '2099-01-01' },
    { spend_cap: 1500, cap_period: 'quarterly' },
    { note: 'Enrollment required' }, { note: 'Prime members only' },
    { mode: 'user_choice' }, { mode: 'quarterly_rotating' }, { mode: 'auto_top_spend' },
  ] as Partial<Reward>[])('does not omit material terms: %j', restrictions => {
    const promo = { category: 'transit', value: 10, unit: 'points_per_dollar', ...restrictions };
    expect(pickHeadlineReward([promo, dining, base])?.reward).toEqual(dining);
  });
  it('prefers a general base rate over a portal bonus', () => {
    const portal = { ...dining, category: 'travel_portal', value: 10 };
    expect(pickHeadlineReward([portal, base])?.reward).toEqual(base);
    expect(pickHeadlineReward([portal])).toEqual({ reward: portal, isPortal: true });
  });
  it('omits a headline when every rate needs unshown terms', () => {
    expect(pickHeadlineReward([{ ...base, spend_cap: 1000 }])).toBeNull();
    expect(pickHeadlineReward([])).toBeNull();
  });
});
