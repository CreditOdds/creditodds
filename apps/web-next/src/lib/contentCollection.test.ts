import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from './fetchWithRetry';
import { getArticle, getArticles } from './articles';
import { getNews, getNewsItem } from './news';
import { getBestPage, getBestPages } from './best';
import { getCard } from './api';
import { CardNotFoundError } from './cardNotFound';
vi.mock('./fetchWithRetry', () => ({ fetchWithRetry: vi.fn() }));
const fetchMock = vi.mocked(fetchWithRetry);
beforeEach(() => vi.resetAllMocks());

describe.each([
  ['articles', 'slug', getArticles, getArticle],
  ['items', 'id', getNews, getNewsItem],
  ['pages', 'slug', getBestPages, getBestPage],
] as const)('%s catalog failures', (key, identifier, list, find) => {
  it.each([404, 429, 500, 503])('propagates HTTP %s instead of claiming a missing slug', async status => {
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    await expect(find('missing')).rejects.toThrow();
  });
  it('propagates network failure', async () => {
    const error = new Error('timeout');
    fetchMock.mockRejectedValue(error);
    await expect(find('missing')).rejects.toBe(error);
  });
  it.each(['{', '{}', 'null'])('rejects malformed catalog %s', async body => {
    fetchMock.mockResolvedValue(new Response(body));
    await expect(list()).rejects.toThrow();
  });
  it('rejects malformed catalog entries', async () => {
    fetchMock.mockImplementation(async () => Response.json({ [key]: [{}] }));
    await expect(find('missing')).rejects.toThrow('Invalid');
  });
  it('returns null only after a successful catalog lookup', async () => {
    fetchMock.mockImplementation(async () => Response.json({ [key]: [{ [identifier]: 'found' }] }));
    expect(await find('found')).toMatchObject({ [identifier]: 'found' });
    expect(await find('missing')).toBeNull();
  });
  it('accepts an explicitly empty collection', async () => {
    fetchMock.mockResolvedValue(Response.json({ [key]: [] }));
    expect(await list()).toEqual([]);
  });
  it('refetches a garbled catalog once under a fresh cache key', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"x": "bad\ncontrol"}'))
      .mockResolvedValueOnce(Response.json({ [key]: [{ [identifier]: 'found' }] }));
    expect(await find('found')).toMatchObject({ [identifier]: 'found' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\?_=\d+$/);
  });
  it('rejects a catalog that is still invalid after the refetch', async () => {
    fetchMock.mockImplementation(async () => new Response('{'));
    await expect(list()).rejects.toThrow('Invalid');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not refetch after HTTP or network failures', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 503 }));
    await expect(list()).rejects.toThrow('503');
    fetchMock.mockReset().mockRejectedValue(new Error('timeout'));
    await expect(list()).rejects.toThrow('timeout');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('single card errors', () => {
  it('uses a typed not-found error only for an actual 404', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(getCard('missing')).rejects.toBeInstanceOf(CardNotFoundError);
  });
  it.each([429, 500, 503])('keeps HTTP %s retryable', async status => {
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    await expect(getCard('card')).rejects.not.toBeInstanceOf(CardNotFoundError);
  });
  it('rejects a malformed successful card response', async () => {
    fetchMock.mockResolvedValue(Response.json({}));
    await expect(getCard('card')).rejects.toThrow('Invalid card');
  });
});
