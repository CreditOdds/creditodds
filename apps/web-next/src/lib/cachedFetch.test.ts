import { afterEach, expect, it, vi } from 'vitest';
import { isPublicCachedRead } from './cachedFetch';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('only shares explicitly cached public reads', () => {
  expect(isPublicCachedRead({ next: { revalidate: 300 } })).toBe(true);
  expect(isPublicCachedRead({ method: 'HEAD', next: { revalidate: 1 } })).toBe(true);
  for (const init of [
    {}, { next: { revalidate: 0 } },
    { method: 'POST' }, { credentials: 'include' }, { cache: 'no-store' },
    { headers: { Authorization: 'Bearer private' } },
    { headers: { Cookie: 'session=private' } },
    { headers: { 'x-user': 'private' } },
  ] as RequestInit[]) {
    expect(isPublicCachedRead(Object.keys(init).length ? { next: { revalidate: 300 }, ...init } : init)).toBe(false);
  }
});
it('never uses the shared server cache in a browser', () => {
  vi.stubGlobal('window', {});
  expect(isPublicCachedRead({ next: { revalidate: 300 } })).toBe(false);
});

it('does not attach a wall-clock deadline to Next-owned reads', async () => {
  vi.useFakeTimers();
  const { fetchCachedWithRetry } = await import('./cachedFetch');
  let finish!: (value: Response) => void;
  const upstream = vi.fn((_input: string, _init: RequestInit) => { void _input; void _init; return new Promise<Response>(resolve => { finish = resolve; }); });
  vi.stubGlobal('fetch', upstream);
  const work = fetchCachedWithRetry('https://example.test/catalog', { next: { revalidate: 300 } }, { attemptTimeoutMs: 1, totalTimeoutMs: 2 });
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(20000);
  finish(Response.json({ ok: true }));
  expect(await (await work).json()).toEqual({ ok: true });
  expect(upstream.mock.calls[0][1]).toEqual({ next: { revalidate: 300 } });
});

it('keeps native failures visible rather than suppressing timeout reports', async () => {
  const { fetchCachedWithRetry } = await import('./cachedFetch');
  const error = new DOMException('Native transport timeout', 'TimeoutError');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
  await expect(fetchCachedWithRetry('https://example.test/catalog', { next: { revalidate: 300 } }, { retries: 0 })).rejects.toBe(error);
});

it('bypasses the first memoized failure on retry and retains cache options', async () => {
  const { fetchCachedWithRetry } = await import('./cachedFetch');
  const upstream = vi.fn().mockImplementation(async (_url, init) => Response.json({ ok: Boolean(init.signal) }, { status: init.signal ? 200 : 503 }));
  vi.stubGlobal('fetch', upstream);
  const res = await fetchCachedWithRetry('https://example.test/catalog', { next: { revalidate: 300 } }, { backoffMs: 0 });
  expect(res.status).toBe(200);
  expect(upstream).toHaveBeenCalledTimes(2);
  expect(upstream.mock.calls[1][1].next).toEqual({ revalidate: 300 });
  expect(upstream.mock.calls[1][1].signal.aborted).toBe(false);
});

it('preserves cache configuration when Next mutates an attempt init object', async () => {
  const { fetchCachedWithRetry } = await import('./cachedFetch');
  const upstream = vi.fn().mockImplementation(async (_url, init) => {
    if (!init.signal) { delete init.next; return new Response(null, { status: 503 }); }
    expect(init.next).toEqual({ revalidate: 300 });
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal('fetch', upstream);
  const init = { next: { revalidate: 300 } };
  expect((await fetchCachedWithRetry('https://example.test/catalog', init, { backoffMs: 0 })).status).toBe(200);
  expect(init.next).toEqual({ revalidate: 300 });
});
