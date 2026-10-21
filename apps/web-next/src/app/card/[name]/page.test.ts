import { beforeEach, expect, it, vi } from 'vitest';
import { CardNotFoundError } from '@/lib/cardNotFound';
import { getCard } from '@/lib/api';
import { notFound } from 'next/navigation';
import CardPage, { generateMetadata } from './page';
vi.mock('./CardClient', () => ({ default: () => null }));
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('CONFIRMED_404'); }) }));
vi.mock('@/lib/api', () => ({
  getCard: vi.fn(), getCardGraphs: vi.fn().mockResolvedValue([]), getCardRecords: vi.fn().mockResolvedValue([]),
  getAllCards: vi.fn().mockResolvedValue([]), getComparePartners: vi.fn().mockResolvedValue([]),
}));
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
