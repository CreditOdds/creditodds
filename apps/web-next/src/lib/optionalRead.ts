// Optional sections must not hold the primary page hostage. Pass the signal
// through to fetch so timed-out work is cancelled, not left running in back.
export async function optionalRead<T>(read: (signal: AbortSignal) => Promise<T>, fallback: T, timeoutMs = 2500): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(controller.signal),
      new Promise<T>(resolve => {
        timer = setTimeout(() => {
          controller.abort(new DOMException('Optional section deadline exceeded', 'TimeoutError'));
          resolve(fallback);
        }, timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
