import type { FetchRetryOptions } from './fetchWithRetry';

// Only explicitly cached, public reads may share work between requests.
export function isPublicCachedRead(init?: RequestInit): boolean {
  const revalidate = init?.next?.revalidate;
  return typeof window === 'undefined' &&
    (revalidate === false || (typeof revalidate === 'number' && revalidate > 0)) &&
    ['GET', 'HEAD'].includes((init?.method ?? 'GET').toUpperCase()) &&
    !init?.body && (!init?.credentials || init.credentials === 'omit') &&
    (!init?.cache || init.cache === 'force-cache' || init.cache === 'default') &&
    [...new Headers(init?.headers).keys()].every(key => key === 'accept') &&
    Object.keys(init ?? {}).every(key => ['next', 'signal', 'method', 'headers', 'credentials', 'cache'].includes(key));
}


// Restore native Next fetch persistence/memoization. Do not keep a module-level
// in-flight promise or an application deadline for cache/ISR-owned work: Amplify
// can freeze the worker after sending the cached response and resume it later.
// Native transport failures still propagate; this does not filter Sentry errors.
export async function fetchCachedWithRetry(input: string | URL, init: RequestInit, opts: FetchRetryOptions = {}): Promise<Response> {
  const retries = opts.retries ?? 4;
  const backoffMs = opts.backoffMs ?? 200;
  if (!Number.isInteger(retries) || retries < 0 || retries > 10) throw new RangeError('Invalid retries');
  if (!Number.isFinite(backoffMs) || backoffMs < 0) throw new RangeError('Invalid backoff');
  for (let attempt = 0; ; attempt++) {
    init.signal?.throwIfAborted();
    try {
      // First call uses native render deduplication. Retries must opt out so a
      // memoized rejected promise/500 is not replayed as another network attempt.
      // Next may mutate its init object while processing revalidation options.
      const options = { ...init, ...(init.next ? { next: { ...init.next } } : {}) };
      if (attempt > 0 && !init.signal) options.signal = new AbortController().signal;
      const res = await fetch(input, options);
      if (res.status >= 500 && attempt < retries) {
        // A Next response can be a tee. Neither awaiting cancellation nor
        // aborting its cache branch is safe; drain without blocking the retry.
        void res.arrayBuffer().catch(() => {});
      } else {
        const bytes = await res.arrayBuffer();
        const body = init.method?.toUpperCase() === 'HEAD' || [204, 205, 304].includes(res.status) ? null : bytes;
        return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
      }
    } catch (error) {
      init.signal?.throwIfAborted();
      if (attempt >= retries) throw error;
    }
    const wait = backoffMs * (attempt + 1) + (backoffMs ? Math.floor(Math.random() * 100) : 0);
    if (wait) await new Promise<void>((resolve, reject) => {
      const done = () => { init.signal?.removeEventListener('abort', cancel); resolve(); };
      const timer = setTimeout(done, wait);
      const cancel = () => { clearTimeout(timer); init.signal?.removeEventListener('abort', cancel); reject(init.signal?.reason); };
      init.signal?.addEventListener('abort', cancel, { once: true });
      if (init.signal?.aborted) cancel();
    });
  }
}
