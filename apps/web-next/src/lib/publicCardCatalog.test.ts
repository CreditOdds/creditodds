import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const cards = [{ slug: 'test', card_name: 'Test', db_card_id: 1 }];
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('deduplicates concurrent reads and caches the enriched public catalog for five minutes', async () => {
  const fetcher = vi.fn(async () => Response.json(cards));
  vi.stubGlobal('fetch', fetcher);
  const { getAllCards } = await import('../../../api/src/lib/public-card-catalog');
  const results = await Promise.all([getAllCards(), getAllCards()]);
  expect(results).toEqual([cards, cards]);
  await getAllCards();
  expect(fetcher).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.now() + 300001);
  await getAllCards();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not retry failed reads or cache an invalid catalog', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(Response.json(cards));
  vi.stubGlobal('fetch', fetcher);
  const { getAllCards } = await import('../../../api/src/lib/public-card-catalog');
  await expect(getAllCards()).rejects.toThrow('503');
  expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(getAllCards()).rejects.toThrow('Invalid public card catalog');
  await expect(getAllCards()).resolves.toEqual(cards);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
