import { afterEach, expect, it, vi } from 'vitest';
import { canCacheResponse } from './responseCache';

afterEach(() => vi.unstubAllGlobals());
it('only shares explicitly cached public reads', () => {
  expect(canCacheResponse({ next: { revalidate: 300 } })).toBe(true);
  expect(canCacheResponse({ method: 'HEAD', next: { revalidate: 1 } })).toBe(true);
  for (const init of [
    {}, { next: { revalidate: 0 } },
    { method: 'POST' }, { credentials: 'include' }, { cache: 'no-store' },
    { headers: { Authorization: 'Bearer private' } },
    { headers: { Cookie: 'session=private' } },
    { headers: { 'x-user': 'private' } },
  ] as RequestInit[]) {
    expect(canCacheResponse(Object.keys(init).length ? { next: { revalidate: 300 }, ...init } : init)).toBe(false);
  }
});
it('never uses the shared server cache in a browser', () => {
  vi.stubGlobal('window', {});
  expect(canCacheResponse({ next: { revalidate: 300 } })).toBe(false);
});
