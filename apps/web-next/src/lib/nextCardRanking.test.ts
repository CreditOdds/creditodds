import { describe, it, expect } from 'vitest';
import { rankNextCards } from '@/lib/nextCardRanking';
import type { Card, CardBenefit, Reward } from '@/lib/api';

// Minimal card fixture — only the fields the ranker reads.
function card(
  partial: Partial<Card> & { slug: string; card_name: string; rewards: Reward[] },
): Card {
  return {
    card_id: partial.slug,
    bank: 'Test Bank',
    accepting_applications: true,
    ...partial,
  } as Card;
}

const cashDining = (slug: string, rate: number): Card =>
  card({
    slug,
    card_name: `Cash Dining ${rate}`,
    reward_type: 'cashback',
    rewards: [
      { category: 'dining', value: rate, unit: 'percent' },
      { category: 'everything_else', value: 1, unit: 'percent' },
    ],
  });

describe('rankNextCards — marginal value', () => {
  it('empty wallet yields absolute value', () => {
    const { recommendations: res } = rankNextCards({
      spend: { dining: 10000 },
      walletSlugs: [],
      prefs: { rewardType: null },
      cards: [cashDining('d3', 3)],
    });
    expect(res).toHaveLength(1);
    // $10k dining × 3% = $300, no baseline to subtract.
    expect(res[0].rewardsValue).toBeCloseTo(300);
    expect(res[0].netAnnualValue).toBeCloseTo(300);
    expect(res[0].rank).toBe(1);
  });

  it('scores a candidate marginally over the existing wallet', () => {
    const { recommendations: res } = rankNextCards({
      spend: { dining: 10000 },
      walletSlugs: ['d3'], // already holds the 3% dining card
      prefs: { rewardType: null },
      cards: [cashDining('d3', 3), cashDining('d4', 4)],
    });
    expect(res).toHaveLength(1);
    expect(res[0].card.slug).toBe('d4');
    // Only the extra 1% over the owned card counts: $10k × (4−3)% = $100.
    expect(res[0].rewardsValue).toBeCloseTo(100);
    expect(res[0].winningCategories[0].category).toBe('dining');
  });

  it('drops a card that is redundant with the wallet', () => {
    const { recommendations: res } = rankNextCards({
      spend: { dining: 10000 },
      walletSlugs: ['d4'], // already holds 4% dining
      prefs: { rewardType: null },
      cards: [cashDining('d4', 4), cashDining('d2', 2)],
    });
    // The 2% card adds nothing over an owned 4% card → filtered out.
    expect(res).toHaveLength(0);
  });

  it('never recommends a card that is not accepting applications', () => {
    const archived = card({
      slug: 'archived',
      card_name: 'Archived 5% Dining',
      reward_type: 'cashback',
      accepting_applications: false,
      rewards: [
        { category: 'dining', value: 5, unit: 'percent' },
        { category: 'everything_else', value: 1, unit: 'percent' },
      ],
    });
    const { recommendations: res } = rankNextCards({
      spend: { dining: 10000 },
      walletSlugs: [],
      prefs: { rewardType: null },
      cards: [archived, cashDining('d2', 2)],
    });
    // The archived card has the higher rate but must not be recommended.
    expect(res.map((r) => r.card.slug)).toEqual(['d2']);
  });

  it('excludes cards the user already owns from results', () => {
    const { recommendations: res } = rankNextCards({
      spend: { dining: 10000 },
      walletSlugs: ['d3'],
      prefs: { rewardType: null },
      cards: [cashDining('d3', 3)],
    });
    expect(res).toHaveLength(0);
  });
});

describe('rankNextCards — points valuation', () => {
  it('values points using the program cpp from valuations.js', () => {
    const sapphire = card({
      slug: 'csr',
      card_name: 'Chase Sapphire Test', // matches Chase UR → 1.25 cpp
      reward_type: 'points',
      rewards: [
        { category: 'dining', value: 3, unit: 'points_per_dollar' },
        { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
      ],
    });
    const { recommendations: res } = rankNextCards({
      spend: { dining: 10000 },
      walletSlugs: [],
      prefs: { rewardType: null },
      cards: [sapphire],
    });
    // 3x × 1.25cpp = 3.75% effective → $10k × 3.75% = $375.
    expect(res[0].rewardsValue).toBeCloseTo(375);
  });
});

describe('rankNextCards — credits are ignored', () => {
  it('does not count card credits toward value (a fee a card cannot out-earn drops it)', () => {
    const benefits: CardBenefit[] = [
      { name: 'Dining Credit', value: 120, description: '', frequency: 'monthly', category: 'dining' },
      { name: 'Lounge Access', value: 600, description: '', frequency: 'annual', category: 'lounge' },
    ];
    const premium = card({
      slug: 'prem',
      card_name: 'Premium Dining Test', // no valuation match → 1.0 cpp
      reward_type: 'points',
      annual_fee: 250,
      rewards: [
        { category: 'dining', value: 4, unit: 'points_per_dollar' },
        { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
      ],
      benefits,
    });
    const { recommendations } = rankNextCards({
      spend: { dining: 5000 },
      walletSlugs: [],
      prefs: { rewardType: null },
      cards: [premium, cashDining('cheap', 2)],
    });
    // $5k × 4% = $200 rewards − $250 fee = −$50. With credits ignored, it is
    // not worth recommending despite its big dining credit.
    expect(recommendations.find((r) => r.card.slug === 'prem')).toBeUndefined();
    // The no-fee 2% card wins on raw category earning.
    expect(recommendations[0].card.slug).toBe('cheap');
  });

  it('ranks on category rewards minus the annual fee only', () => {
    const benefits: CardBenefit[] = [
      { name: 'Travel Credit', value: 300, description: '', frequency: 'annual', category: 'travel' },
    ];
    const travelCredit = card({
      slug: 'tc',
      card_name: 'Travel Credit Test',
      reward_type: 'cashback',
      annual_fee: 95,
      rewards: [
        { category: 'dining', value: 3, unit: 'percent' },
        { category: 'everything_else', value: 1, unit: 'percent' },
      ],
      benefits,
    });
    const { recommendations: res } = rankNextCards({
      spend: { dining: 10000 },
      walletSlugs: [],
      prefs: { rewardType: null },
      cards: [travelCredit],
    });
    // $300 rewards − $95 fee = $205. The $300 travel credit is ignored entirely.
    expect(res[0].netAnnualValue).toBeCloseTo(205);
  });
});

describe('rankNextCards — flexible bonuses and caps', () => {
  // A Custom-Cash-style card: 5% on the single top eligible category, capped at
  // $500/mo ($6k/yr), then 1%. Must NOT earn 5% across every eligible category.
  const customCash = (slug: string): Card =>
    card({
      slug,
      card_name: `Custom Cash ${slug}`,
      reward_type: 'cashback',
      rewards: [
        {
          category: 'top_category',
          value: 5,
          unit: 'percent',
          mode: 'auto_top_spend',
          eligible_categories: ['dining', 'groceries', 'gas', 'transit', 'travel', 'streaming'],
          spend_cap: 500,
          cap_period: 'monthly',
          rate_after_cap: 1,
        },
        { category: 'everything_else', value: 1, unit: 'percent' },
      ] as Reward[],
    });

  it('awards a single-category bonus to only the top-spend category', () => {
    const { recommendations: res } = rankNextCards({
      spend: { dining: 6000, groceries: 4800, gas: 2400 },
      walletSlugs: [],
      prefs: { rewardType: null },
      cards: [customCash('cc')],
    });
    const wins = res[0].winningCategories;
    // Only dining (the top-spend eligible bucket) should earn the 5% bonus.
    const bonusWins = wins.filter((w) => w.rate >= 5);
    expect(bonusWins.map((w) => w.category)).toEqual(['dining']);
    // $6k dining × 5% = $300 (exactly at the $6k annual cap), groceries/gas at 1%
    // but baseline is 0 so they still add 1%: 4800×1% + 2400×1% = $72.
    expect(res[0].rewardsValue).toBeCloseTo(300 + 72);
  });

  it('caps the bonus rate at the annualized spend cap', () => {
    // $12k dining, but only $6k/yr earns 5%; the rest earns 1% (rate_after_cap).
    const { recommendations: res } = rankNextCards({
      spend: { dining: 12000 },
      walletSlugs: [],
      prefs: { rewardType: null },
      cards: [customCash('cc')],
    });
    // $6k × 5% + $6k × 1% = $300 + $60 = $360.
    expect(res[0].rewardsValue).toBeCloseTo(360);
  });

  it('does not credit a quarterly-rotating bonus, even for the current category', () => {
    // Discover-it-style: 5% rotating, currently on dining, plus 1% base. The
    // user can't control the rotation, so dining must only earn the 1% base —
    // it loses to a plain 3% dining card.
    const rotating = card({
      slug: 'rot',
      card_name: 'Rotating 5 Test',
      reward_type: 'cashback',
      rewards: [
        {
          category: 'rotating',
          value: 5,
          unit: 'percent',
          mode: 'quarterly_rotating',
          current_categories: [{ category: 'dining' }],
          current_period: 'Q2',
          spend_cap: 1500,
          cap_period: 'quarterly',
          rate_after_cap: 1,
        },
        { category: 'everything_else', value: 1, unit: 'percent' },
      ] as Reward[],
    });
    const { recommendations } = rankNextCards({
      spend: { dining: 10000 },
      walletSlugs: [],
      prefs: { rewardType: null },
      cards: [rotating, cashDining('flat3', 3)],
    });
    // The 3% direct card wins; the rotating card only earns its 1% base.
    expect(recommendations[0].card.slug).toBe('flat3');
    const rot = recommendations.find((r) => r.card.slug === 'rot');
    expect(rot?.rewardsValue ?? 0).toBeLessThan(150); // base 1% ($100), not 5% ($500)
  });

  it('stacks two copies of the same card so their caps add up', () => {
    // Two Custom Cash (same slug listed twice) → 5% on the first $1,000/mo
    // ($12k/yr) of dining. A flat 3% dining card adds nothing on top.
    const { walletAnalysis, recommendations } = rankNextCards({
      spend: { dining: 12000 },
      walletSlugs: ['cc', 'cc'],
      prefs: { rewardType: null },
      cards: [customCash('cc'), cashDining('flat3', 3)],
    });
    const dining = walletAnalysis.find((w) => w.category === 'dining');
    expect(dining?.earned).toBeCloseTo(600); // all $12k at 5%
    expect(dining?.best.rate).toBeCloseTo(5);
    expect(dining?.best.spend).toBeCloseTo(12000); // both $6k caps cover all $12k
    expect(dining?.next).toBeNull(); // nothing spills over
    expect(recommendations.find((r) => r.card.slug === 'flat3')).toBeUndefined();
  });

  it('splits a category into best + overflow tiers when the cap is exceeded', () => {
    // One Custom Cash, $12k dining: first $6k at 5%, the next $6k at base 1%.
    const { walletAnalysis } = rankNextCards({
      spend: { dining: 12000 },
      walletSlugs: ['cc'],
      prefs: { rewardType: null },
      cards: [customCash('cc')],
    });
    const dining = walletAnalysis.find((w) => w.category === 'dining');
    expect(dining?.best.rate).toBeCloseTo(5);
    expect(dining?.best.spend).toBeCloseTo(6000); // the $500/mo cap
    expect(dining?.best.card).toBe('Custom Cash cc');
    expect(dining?.next?.rate).toBeCloseTo(1); // overflow falls to base
    expect(dining?.next?.spend).toBeCloseTo(6000);
    // The base rate is attributed to the card that provides it (here the same
    // Custom Cash, via its 1% everything-else).
    expect(dining?.next?.card).toBe('Custom Cash cc');
  });

  it('attributes the base rate to a flat card like a 2% Active Cash', () => {
    // Custom Cash 5% on the first $6k dining, then the 2% Active Cash catches
    // the overflow (it provides the best everything-else rate in the wallet).
    const activeCash = card({
      slug: 'active',
      card_name: 'Wells Fargo Active Cash',
      reward_type: 'cashback',
      rewards: [{ category: 'everything_else', value: 2, unit: 'percent' }],
    });
    const { walletAnalysis } = rankNextCards({
      spend: { dining: 12000, everything_else: 6000 },
      walletSlugs: ['cc', 'active'],
      prefs: { rewardType: null },
      cards: [customCash('cc'), activeCash],
    });
    const dining = walletAnalysis.find((w) => w.category === 'dining');
    expect(dining?.next?.rate).toBeCloseTo(2);
    expect(dining?.next?.card).toBe('Wells Fargo Active Cash');
    // Everything-else earns the 2% flat, named to the card.
    const everything = walletAnalysis.find((w) => w.category === 'everything_else');
    expect(everything?.best.rate).toBeCloseTo(2);
    expect(everything?.best.card).toBe('Wells Fargo Active Cash');
  });

  it('does not strand a narrowly-eligible flexible bonus behind a broad one', () => {
    // Both 5%, capped $6k/yr. Broad earns on {gas, streaming}; narrow only on
    // {gas}. With gas=$6k and streaming=$6k the optimal wallet earns $600
    // (narrow→gas, broad→streaming), so the narrow card adds $240 over a wallet
    // that already holds the broad one — it must NOT be scored at $0.
    const flex = (slug: string, cats: string[]): Card =>
      card({
        slug,
        card_name: `Flex ${slug}`,
        reward_type: 'cashback',
        rewards: [
          {
            category: 'top_category',
            value: 5,
            unit: 'percent',
            mode: 'auto_top_spend',
            eligible_categories: cats,
            spend_cap: 500,
            cap_period: 'monthly',
            rate_after_cap: 1,
          },
          { category: 'everything_else', value: 1, unit: 'percent' },
        ] as Reward[],
      });
    const { recommendations } = rankNextCards({
      spend: { gas: 6000, streaming: 6000 },
      walletSlugs: ['broad'],
      prefs: { rewardType: null },
      cards: [flex('broad', ['gas', 'streaming']), flex('narrow', ['gas'])],
    });
    const rec = recommendations.find((r) => r.card.slug === 'narrow');
    expect(rec).toBeDefined();
    // $6k gas × (5% − 1%) = $240 added once the broad bonus moves to streaming.
    expect(rec?.rewardsValue).toBeCloseTo(240);
  });

  it('recognizes a card that helps only above the stacked cap', () => {
    // Same two Custom Cash, but $18k dining: $12k at 5%, the next $6k at 1%.
    // A flat 3% dining card now adds value on that above-cap $6k: 6k×(3−1)% = $120.
    const { recommendations } = rankNextCards({
      spend: { dining: 18000 },
      walletSlugs: ['cc', 'cc'],
      prefs: { rewardType: null },
      cards: [customCash('cc'), cashDining('flat3', 3)],
    });
    const rec = recommendations.find((r) => r.card.slug === 'flat3');
    expect(rec).toBeDefined();
    expect(rec?.rewardsValue).toBeCloseTo(120);
  });
});

describe('rankNextCards — brand loyalty on travel', () => {
  // Choice-Privileges-style: 10x at one hotel brand (merchant_specific).
  const choice = card({
    slug: 'choice',
    card_name: 'Wells Fargo Choice Privileges',
    reward_type: 'points',
    rewards: [
      { category: 'hotels', value: 10, unit: 'points_per_dollar', merchant_specific: true },
      { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
    ] as Reward[],
  });
  // United-Gateway-style: 2x gated to United (merchant_gate).
  const unitedCard = card({
    slug: 'united',
    card_name: 'United Gateway',
    reward_type: 'points',
    rewards: [
      { category: 'airlines', value: 2, unit: 'points_per_dollar', merchant_gate: ['united-airlines'] },
      { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
    ] as Reward[],
  });
  const genericTravel = card({
    slug: 'gt',
    card_name: 'Generic Travel',
    reward_type: 'cashback',
    rewards: [
      { category: 'travel', value: 3, unit: 'percent' },
      { category: 'everything_else', value: 1, unit: 'percent' },
    ],
  });

  it('does not credit a brand-specific hotel rate against generic hotel spend', () => {
    // No loyalty: Choice Privileges' 10x only applies at Choice Hotels. It still
    // earns its 1% base on $6k hotels ($60), but must NOT get the 10x ($600).
    const { recommendations } = rankNextCards({
      spend: { hotels: 6000 },
      walletSlugs: [],
      prefs: { rewardType: null },
      cards: [choice],
    });
    const rec = recommendations.find((r) => r.card.slug === 'choice');
    expect(rec?.rewardsValue).toBeLessThan(120); // base ~$60, not the 10x ($600)
  });

  it('counts a merchant-gated co-brand rate only when the user is loyal to that brand', () => {
    const noLoyalty = rankNextCards({
      spend: { flights: 6000 },
      walletSlugs: [],
      prefs: { rewardType: null },
      cards: [unitedCard],
    });
    const loyal = rankNextCards({
      spend: { flights: 6000 },
      walletSlugs: [],
      prefs: { rewardType: null, allegiances: ['united'] },
      cards: [unitedCard],
    });
    const noRec = noLoyalty.recommendations.find((r) => r.card.slug === 'united');
    const yesRec = loyal.recommendations.find((r) => r.card.slug === 'united');
    expect(noRec).toBeDefined();
    expect(yesRec).toBeDefined();
    // The 2x United airline rate is unlocked only by loyalty, ~doubling earning.
    expect(yesRec!.rewardsValue).toBeGreaterThan(noRec!.rewardsValue * 1.5);
  });

  it('still counts generic travel rates (which apply to flights and hotels) regardless of loyalty', () => {
    const { recommendations } = rankNextCards({
      spend: { flights: 6000 },
      walletSlugs: [],
      prefs: { rewardType: null },
      cards: [genericTravel],
    });
    expect(recommendations[0]?.card.slug).toBe('gt');
    expect(recommendations[0]?.rewardsValue).toBeCloseTo(180); // $6k × 3%
  });
});

describe('rankNextCards — cash vs points soft preference', () => {
  it('breaks an otherwise-tied ranking toward the preferred reward type', () => {
    const cash = cashDining('cash', 3); // $300 net
    const points = card({
      slug: 'points',
      card_name: 'Generic Points Test', // 1.0 cpp → also $300 net
      reward_type: 'points',
      rewards: [
        { category: 'dining', value: 3, unit: 'points_per_dollar' },
        { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
      ],
    });
    const { recommendations: res } = rankNextCards({
      spend: { dining: 10000 },
      walletSlugs: [],
      prefs: { rewardType: 'cashback' },
      cards: [points, cash], // points listed first to prove ordering isn't input order
    });
    expect(res.map((r) => r.card.slug)).toEqual(['cash', 'points']);
    // Honest displayed value stays equal; only the ranking score was nudged.
    expect(res[0].netAnnualValue).toBeCloseTo(res[1].netAnnualValue);
  });
});
