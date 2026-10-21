// Bounded GET/HEAD reads for SSR/ISR. Deadlines cover both headers and body.
// A signal opts out of Next's per-render fetch memoization on EVERY attempt;
// Next's persistent Data Cache (next.revalidate) still works independently.
// Never replay mutations after an ambiguous network failure.
export interface FetchRetryOptions {
  retries?: number;
  backoffMs?: number;
  attemptTimeoutMs?: number;
  totalTimeoutMs?: number;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}

// Race as well as abort: a patched fetch/tee may not settle when aborted.
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}

async function delay(ms: number, signal: AbortSignal): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await abortable(new Promise<void>(resolve => { timer = setTimeout(resolve, ms); }), signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWithRetry(
  input: string | URL,
  init?: RequestInit,
  opts: FetchRetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 4;
  const backoffMs = opts.backoffMs ?? 200;
  if (!Number.isInteger(retries) || retries < 0 || retries > 10) throw new RangeError('Invalid retries');
  if (!Number.isFinite(backoffMs) || backoffMs < 0) throw new RangeError('Invalid backoff');
  const attemptMs = positive(opts.attemptTimeoutMs ?? 4000, 'attemptTimeoutMs');
  const totalMs = positive(opts.totalTimeoutMs ?? 10000, 'totalTimeoutMs');
  const maxRetries = ['GET', 'HEAD'].includes((init?.method ?? 'GET').toUpperCase()) ? retries : 0;
  const total = new AbortController();
  const cancel = () => total.abort(init?.signal?.reason);
  init?.signal?.addEventListener('abort', cancel, { once: true });
  if (init?.signal?.aborted) cancel();
  const totalTimer = setTimeout(() => total.abort(new DOMException('Request deadline exceeded', 'TimeoutError')), totalMs);
  try {
    for (let attempt = 0; ; attempt++) {
      total.signal.throwIfAborted();
      const controller = new AbortController();
      const abortAttempt = () => controller.abort(total.signal.reason);
      total.signal.addEventListener('abort', abortAttempt, { once: true });
      const timer = setTimeout(() => controller.abort(new DOMException('Attempt deadline exceeded', 'TimeoutError')), attemptMs);
      try {
        const res = await abortable(fetch(input, { ...init, signal: controller.signal }), controller.signal);
        if (res.status >= 500 && attempt < maxRetries) {
          // Never await cancellation: Next can return one branch of a tee whose
          // other branch stays open. Aborting the request releases its socket.
          void res.body?.cancel().catch(() => {});
          controller.abort();
        } else {
          const buffer = await abortable(res.arrayBuffer(), controller.signal);
          const body = [204, 205, 304].includes(res.status) || init?.method?.toUpperCase() === 'HEAD' ? null : buffer;
          return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
        }
      } catch (error) {
        total.signal.throwIfAborted();
        if (attempt >= maxRetries) throw error;
      } finally {
        clearTimeout(timer);
        total.signal.removeEventListener('abort', abortAttempt);
        // Also terminate failed/body-stalled requests before another attempt.
        controller.abort();
      }
      const wait = backoffMs * (attempt + 1) + (backoffMs ? Math.floor(Math.random() * 100) : 0);
      await delay(wait, total.signal);
    }
  } finally {
    clearTimeout(totalTimer);
    init?.signal?.removeEventListener('abort', cancel);
  }
}
