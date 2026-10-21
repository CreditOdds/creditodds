import { afterEach, expect, it, vi } from 'vitest';
import { optionalRead } from './optionalRead';
afterEach(() => vi.useRealTimers());
it('returns fallback on the section deadline and cancels upstream work', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const result = optionalRead(s => { signal = s; return new Promise<string>(() => {}); }, 'fallback');
  await vi.advanceTimersByTimeAsync(2500);
  expect(await result).toBe('fallback');
  expect(signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it('independent sections finish concurrently and leave no timers', async () => {
  vi.useFakeTimers();
  const read = () => new Promise<string>(resolve => setTimeout(() => resolve('ok'), 100));
  const result = Promise.all([optionalRead(read, ''), optionalRead(read, ''), optionalRead(read, '')]);
  await vi.advanceTimersByTimeAsync(100);
  expect(await result).toEqual(['ok', 'ok', 'ok']);
  expect(vi.getTimerCount()).toBe(0);
});
