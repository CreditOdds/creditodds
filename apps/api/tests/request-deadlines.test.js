const { fetchWithDeadline } = require('../src/lib/fetch-with-deadline');
const brevo = require('../src/lib/brevo');
const originalFetch = global.fetch;
beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.useRealTimers(); global.fetch = originalFetch; });

test.each(['headers', 'body'])('bounds stalled %s, aborts the transport, clears timers', async phase => {
  const never = new Promise(() => {});
  global.fetch = jest.fn(() => phase === 'headers' ? never : Promise.resolve({ text: () => never }));
  const result = expect(fetchWithDeadline('https://upstream.test', {}, 50)).rejects.toMatchObject({ name: 'TimeoutError' });
  await jest.advanceTimersByTimeAsync(50);
  await result;
  expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('caller abort terminates work without waiting for the deadline', async () => {
  global.fetch = jest.fn(() => new Promise(() => {}));
  const controller = new AbortController();
  const result = expect(fetchWithDeadline('https://upstream.test', { signal: controller.signal })).rejects.toThrow('left');
  controller.abort(new Error('left'));
  await result;
  expect(jest.getTimerCount()).toBe(0);
});

test('an already aborted caller sends no request', async () => {
  global.fetch = jest.fn();
  await expect(fetchWithDeadline('https://upstream.test', { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('Brevo does not retry a mutation after an ambiguous timeout', async () => {
  global.fetch = jest.fn(() => new Promise(() => {}));
  const result = expect(brevo.upsertContact('test@example.com')).rejects.toMatchObject({ name: 'TimeoutError' });
  await jest.advanceTimersByTimeAsync(8000);
  await result;
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('Brevo refuses Retry-After beyond its overall deadline', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => '60' }, text: async () => '{}' });
  await expect(brevo.getContact('test@example.com')).rejects.toMatchObject({ name: 'TimeoutError' });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
