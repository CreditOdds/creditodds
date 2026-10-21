import { expect, it, vi } from 'vitest';
import LandingPage from './page';
import ExplorePage from './explore/page';
import { pickHeadlineReward } from '@/lib/cardDisplayUtils';
const { cards } = vi.hoisted(() => ({ cards: [{
  card_id: 1, slug: 'test', card_name: 'Test', bank: 'Bank', accepting_applications: true,
  rewards: [
    { category: 'transit', value: 10, unit: 'points_per_dollar', merchant_gate: ['lyft'], expires: '2027-09-30' },
    { category: 'sporting_goods', value: 10, unit: 'points_per_dollar', merchant_specific: true },
    { category: 'dining', value: 3, unit: 'points_per_dollar' },
  ],
}] }));
vi.mock('@/lib/api', () => ({
  getAllCards: vi.fn().mockResolvedValue(cards), getCardViewCounts: vi.fn().mockResolvedValue({}),
  getContentViewCounts: vi.fn().mockResolvedValue({ article: {}, news: {} }),
}));
vi.mock('@/lib/news', () => ({ getNews: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/articles', () => ({ getArticles: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/best', () => ({ getBestPages: vi.fn().mockResolvedValue([]) }));
vi.mock('./LandingClient', () => ({ default: () => null }));
vi.mock('./explore/ExploreV2Client', () => ({ default: () => null }));
vi.mock('@/components/seo/JsonLd', () => ({ BreadcrumbSchema: () => null }));
it('retains restrictions through both server-to-client projections', async () => {
  const landing = await LandingPage();
  const explore = await ExplorePage();
  for (const projected of [landing.props.initialCards, explore.props.children[1].props.cards]) {
    expect(projected[0].rewards).toEqual(cards[0].rewards);
    expect(pickHeadlineReward(projected[0].rewards)?.reward.category).toBe('dining');
  }
});
