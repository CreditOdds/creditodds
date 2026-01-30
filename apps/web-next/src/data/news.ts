// Card News data types and content

export type NewsTag =
  | 'new-card'
  | 'discontinued'
  | 'bonus-change'
  | 'fee-change'
  | 'benefit-change'
  | 'limited-time'
  | 'policy-change'
  | 'general';

export interface NewsItem {
  id: string;
  date: string; // ISO date string
  title: string;
  summary: string;
  tags: NewsTag[];
  bank?: string;
  cardSlug?: string;
  cardName?: string;
  source?: string;
  sourceUrl?: string;
}

export const tagLabels: Record<NewsTag, string> = {
  'new-card': 'New Card',
  'discontinued': 'Discontinued',
  'bonus-change': 'Bonus Change',
  'fee-change': 'Fee Change',
  'benefit-change': 'Benefit Change',
  'limited-time': 'Limited Time',
  'policy-change': 'Policy Change',
  'general': 'General',
};

export const tagColors: Record<NewsTag, string> = {
  'new-card': 'bg-green-100 text-green-800',
  'discontinued': 'bg-red-100 text-red-800',
  'bonus-change': 'bg-blue-100 text-blue-800',
  'fee-change': 'bg-yellow-100 text-yellow-800',
  'benefit-change': 'bg-purple-100 text-purple-800',
  'limited-time': 'bg-orange-100 text-orange-800',
  'policy-change': 'bg-gray-100 text-gray-800',
  'general': 'bg-indigo-100 text-indigo-800',
};

// News items - newest first
export const newsItems: NewsItem[] = [
  {
    id: 'robinhood-gold-launch',
    date: '2024-03-15',
    title: 'Robinhood Gold Card Now Available',
    summary: 'Robinhood has launched their highly anticipated Gold Card with 3% cashback on all purchases for Gold members.',
    tags: ['new-card'],
    bank: 'Robinhood',
    cardSlug: 'robinhood-gold-card',
    cardName: 'Robinhood Gold Card',
  },
  {
    id: 'amex-gold-bonus-increase',
    date: '2024-03-10',
    title: 'Amex Gold Welcome Bonus Increased to 75,000 Points',
    summary: 'American Express has temporarily increased the welcome bonus on the Gold Card to 75,000 Membership Rewards points.',
    tags: ['bonus-change', 'limited-time'],
    bank: 'American Express',
    cardSlug: 'american-express-gold-card',
    cardName: 'American Express Gold Card',
  },
  {
    id: 'chase-sapphire-af-increase',
    date: '2024-02-28',
    title: 'Chase Sapphire Reserve Annual Fee Increasing',
    summary: 'Chase has announced the Sapphire Reserve annual fee will increase from $550 to $650 starting in April.',
    tags: ['fee-change'],
    bank: 'Chase',
    cardSlug: 'chase-sapphire-reserve',
    cardName: 'Chase Sapphire Reserve',
  },
  {
    id: 'discover-5-categories-2024',
    date: '2024-02-15',
    title: 'Discover Announces 2024 5% Categories',
    summary: 'Discover has revealed their rotating 5% cashback categories for 2024, starting with grocery stores and fitness clubs in Q1.',
    tags: ['benefit-change'],
    bank: 'Discover',
  },
  {
    id: 'citi-custom-cash-update',
    date: '2024-02-01',
    title: 'Citi Custom Cash Now Earns 5% on More Categories',
    summary: 'Citi has expanded the eligible 5% categories for the Custom Cash card to include additional merchants.',
    tags: ['benefit-change'],
    bank: 'Citi',
    cardSlug: 'citi-custom-cash-card',
    cardName: 'Citi Custom Cash Card',
  },
  {
    id: 'wells-fargo-attune',
    date: '2024-01-20',
    title: 'Wells Fargo Launches Attune Card',
    summary: 'Wells Fargo has introduced the Attune card, focused on sustainability with rewards for eco-friendly purchases.',
    tags: ['new-card'],
    bank: 'Wells Fargo',
    cardSlug: 'wells-fargo-attune-card',
    cardName: 'Wells Fargo Attune Card',
  },
  {
    id: 'capital-one-venture-x-lounge',
    date: '2024-01-15',
    title: 'New Capital One Lounge Opening in Denver',
    summary: 'Capital One announces a new airport lounge at Denver International Airport for Venture X cardholders.',
    tags: ['benefit-change'],
    bank: 'Capital One',
    cardSlug: 'capital-one-venture-x-rewards-credit-card',
    cardName: 'Capital One Venture X',
  },
  {
    id: 'amex-centurion-changes',
    date: '2024-01-10',
    title: 'Amex Updates Centurion Lounge Access Policy',
    summary: 'American Express is updating guest access policies at Centurion Lounges, limiting complimentary guests for Platinum cardholders.',
    tags: ['policy-change'],
    bank: 'American Express',
  },
  {
    id: 'bilt-rent-day-update',
    date: '2024-01-05',
    title: 'Bilt Rent Day Now Includes Transfer Bonuses',
    summary: 'Bilt has enhanced their monthly Rent Day promotion to include bonus points when transferring to airline partners.',
    tags: ['benefit-change', 'limited-time'],
    bank: 'Bilt',
    cardSlug: 'bilt-mastercard',
    cardName: 'Bilt Mastercard',
  },
  {
    id: 'us-bank-altitude-discontinued',
    date: '2023-12-15',
    title: 'US Bank Altitude Reserve No Longer Accepting Applications',
    summary: 'US Bank has stopped accepting new applications for the Altitude Reserve card. Existing cardholders are unaffected.',
    tags: ['discontinued'],
    bank: 'US Bank',
  },
  {
    id: 'chase-ink-bonus',
    date: '2023-12-01',
    title: 'Chase Ink Business Preferred Bonus Increased',
    summary: 'Chase is offering an elevated 100,000 point welcome bonus on the Ink Business Preferred card for a limited time.',
    tags: ['bonus-change', 'limited-time'],
    bank: 'Chase',
    cardSlug: 'chase-ink-business-preferred-credit-card',
    cardName: 'Chase Ink Business Preferred',
  },
  {
    id: 'apple-card-savings-rate',
    date: '2023-11-20',
    title: 'Apple Card Savings Account Rate Increases',
    summary: 'Apple has increased the APY on the Apple Card Savings account to 4.50%, one of the highest rates available.',
    tags: ['benefit-change'],
    bank: 'Apple',
    cardSlug: 'apple-card',
    cardName: 'Apple Card',
  },
];
