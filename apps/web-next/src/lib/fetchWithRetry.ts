// Retry wrapper for idempotent (GET) data reads used by server-side rendering /
// ISR. Transient network failures (ETIMEDOUT, ECONNRESET, "fetch failed")
// between our SSR server and the upstream CDN/API are brief and almost always
// succeed on a second attempt. Retrying here keeps a blip from failing an ISR
// render — which otherwise reports to Sentry and, on a cold cache, errors the
// page (see the /best/[slug] "fetch failed" incident, 2026-06-25).
//
// IMPORTANT: only use this for GET reads. Never wrap POST/mutations — a retry
// after the server already applied the write would double-apply it.

const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 250;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
  input: string | URL,
  init?: RequestInit,
  opts: { retries?: number; backoffMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      // Retry transient upstream failures (5xx), but never client errors (4xx).
      if (res.status >= 500 && attempt < retries) {
        await delay(backoffMs * (attempt + 1));
        continue;
      }
      return res;
    } catch (error) {
      // Network-level failure (e.g. ETIMEDOUT / "fetch failed"). Retry if budget remains.
      lastError = error;
      if (attempt < retries) {
        await delay(backoffMs * (attempt + 1));
        continue;
      }
    }
  }
  // Exhausted retries on a network error — rethrow the original so callers and
  // Sentry still see the real failure.
  throw lastError;
}
