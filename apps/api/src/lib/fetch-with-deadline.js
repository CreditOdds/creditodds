// A deadline includes body consumption, not just receipt of HTTP headers.
// No automatic retries: callers may be sending non-idempotent requests.
async function fetchWithDeadline(url, init = {}, timeoutMs = 8000) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Invalid request deadline');
  const controller = new AbortController();
  const cancel = () => controller.abort(init.signal.reason);
  init.signal?.addEventListener('abort', cancel, { once: true });
  if (init.signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new DOMException('Upstream deadline exceeded', 'TimeoutError')), timeoutMs);
  let onAbort;
  try {
    controller.signal.throwIfAborted();
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const text = await response.text();
        return { response, text };
      })(),
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
    init.signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
}
module.exports = { fetchWithDeadline };
