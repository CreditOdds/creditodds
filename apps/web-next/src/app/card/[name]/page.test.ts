import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CardNotFoundError } from '@/lib/cardNotFound';
import { getCard, getCardRatings, getCardWire, getCardProductChanges, EMPTY_PRODUCT_CHANGES } from '@/lib/api';
import { notFound } from 'next/navigation';
import CardPage, { generateMetadata } from './page';
vi.mock('./CardClient', () => ({ default: () => null }));
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('CONFIRMED_404'); }) }));
vi.mock('@/lib/api', () => ({
  getCardRatings: vi.fn(), getCardWire: vi.fn(), getCardProductChanges: vi.fn(),
  EMPTY_PRODUCT_CHANGES: { inbound: [], outbound: [], inbound_total: 0, outbound_total: 0 },
  getCard: vi.fn(), getCardGraphs: vi.fn().mockResolvedValue([]), getCardRecords: vi.fn().mockResolvedValue([]),
  getAllCards: vi.fn().mockResolvedValue([]), getComparePartners: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/localCardBenefits', () => ({ getLocalCardBenefits: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/news', () => ({ getNews: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/articles', () => ({ getArticles: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/best', () => ({ getBestPages: vi.fn().mockResolvedValue([]) }));
const props = { params: Promise.resolve({ name: 'test-card' }) };
beforeEach(() => vi.clearAllMocks());
it.each([CardPage, generateMetadata])('propagates temporary failures without generating a 404', async render => {
  const error = new Error('API unavailable');
  vi.mocked(getCard).mockRejectedValue(error);
  await expect(render(props)).rejects.toBe(error);
  expect(notFound).not.toHaveBeenCalled();
});
it.each([CardPage, generateMetadata])('generates a 404 only for a confirmed missing card', async render => {
  vi.mocked(getCard).mockRejectedValue(new CardNotFoundError());
  await expect(render(props)).rejects.toThrow('CONFIRMED_404');
  expect(notFound).toHaveBeenCalledOnce();
});

afterEach(() => vi.useRealTimers());
it('starts ratings, wire and product changes together and bounds a stalled section', async () => {
  vi.useFakeTimers();
  vi.mocked(getCard).mockResolvedValue({ card_id: 1, card_name: 'Test card', slug: 'test-card', bank: 'Test' } as Awaited<ReturnType<typeof getCard>>);
  vi.mocked(getCardRatings).mockReturnValue(new Promise(() => {}));
  vi.mocked(getCardWire).mockResolvedValue([]);
  vi.mocked(getCardProductChanges).mockResolvedValue(EMPTY_PRODUCT_CHANGES);
  const render = CardPage(props);
  await vi.advanceTimersByTimeAsync(0);
  expect(getCardRatings).toHaveBeenCalledOnce();
  expect(getCardWire).toHaveBeenCalledOnce();
  expect(getCardProductChanges).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(2500);
  const result = await render;
  expect(result.props.ratings).toEqual({ count: 0, average: null });
  expect(vi.mocked(getCardRatings).mock.calls[0][2]?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
