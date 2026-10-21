import { afterEach, expect, it, vi } from 'vitest';
import { createResilientLookup } from './resilientLookup';

const timeout = () => new DOMException('Request deadline exceeded', 'TimeoutError');
const story = { id: 'known', title: 'Published story' };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('shares concurrent reads and retries after a failed refresh', async () => {
  const load = vi.fn().mockRejectedValueOnce(timeout()).mockResolvedValue([story]);
  const lookup = createResilientLookup<{ id: string }>(load, item => item.id);
  const results = await Promise.allSettled([lookup('known'), lookup('known')]);
  expect(results.map(result => result.status)).toEqual(['rejected', 'rejected']);
  expect(load).toHaveBeenCalledTimes(1);
  expect(await lookup('known')).toEqual(story);
  expect(load).toHaveBeenCalledTimes(2);
});

it('preserves a known story through a timeout, but cannot infer absence', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const load = vi.fn().mockResolvedValueOnce([story]).mockRejectedValue(timeout());
  const lookup = createResilientLookup<{ id: string }>(load, item => item.id);
  expect(await lookup('known')).toEqual(story);
  expect(await lookup('known')).toEqual(story);
  await expect(lookup('unknown')).rejects.toMatchObject({ name: 'TimeoutError' });
});

it('expires the fallback after one hour even if refreshes keep failing', async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const load = vi.fn().mockResolvedValueOnce([story]).mockRejectedValue(timeout());
  const lookup = createResilientLookup<{ id: string }>(load, item => item.id);
  await lookup('known');
  vi.advanceTimersByTime(3599999);
  expect(await lookup('known')).toEqual(story);
  vi.advanceTimersByTime(1);
  await expect(lookup('known')).rejects.toMatchObject({ name: 'TimeoutError' });
});

it('honors removal in a successful catalog, replacing the old snapshot', async () => {
  const load = vi.fn().mockResolvedValueOnce([story]).mockResolvedValueOnce([]).mockRejectedValue(timeout());
  const lookup = createResilientLookup<{ id: string }>(load, item => item.id);
  await lookup('known');
  expect(await lookup('known')).toBeNull();
  await expect(lookup('known')).rejects.toMatchObject({ name: 'TimeoutError' });
});

it.each([new Error('Invalid catalog'), new Error('HTTP 503'), new DOMException('Cancelled', 'AbortError')])(
  'does not hide non-timeout failure %s', async error => {
    const load = vi.fn().mockResolvedValueOnce([story]).mockRejectedValue(error);
    const lookup = createResilientLookup<{ id: string }>(load, item => item.id);
    await lookup('known');
    await expect(lookup('known')).rejects.toBe(error);
  },
);
