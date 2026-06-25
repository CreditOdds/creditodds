// Retry wrapper for idempotent (GET) data reads used by server-side rendering /
// ISR. Transient network failures between our SSR server and the upstream
// CDN/API are brief and almost always succeed on a second attempt. Retrying
// here keeps a blip from failing an ISR render — which otherwise reports to
// Sentry and, on a cold cache, errors the page.
//
// Two failure modes are covered, both seen in production on 2026-06-25:
//   1. The fetch() itself rejects — ETIMEDOUT / "fetch failed" / TLS handshake
//      aborted (/best/[slug], /best-card-for/[slug]).
//   2. The fetch() resolves 200 but the connection drops *while the body is
//      read* — "terminated" / "other side closed", an undici keep-alive race
//      where the upstream closes a pooled socket mid-response (/card-wire).
// To catch (2), we read the body INSIDE the retry loop and return a buffered
// Response, so a mid-stream termination retries here instead of exploding later
// in the caller's res.json(). Callers see an ordinary Response (res.ok /
// res.json() work) that now reads from memory and can't terminate.
//
// IMPORTANT: only use this for GET reads. Never wrap POST/mutations — a retry
// after the server already applied the write would double-apply it.

const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 250;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Statuses that the Response constructor requires to have a null body.
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

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
        await res.body?.cancel();
        await delay(backoffMs * (attempt + 1));
        continue;
      }

      // Buffer the body here so a mid-stream socket termination is caught and
      // retried in this loop rather than surfacing later in the caller's read.
      const buffer = await res.arrayBuffer();
      const body = NULL_BODY_STATUSES.has(res.status) || res.status < 200 ? null : buffer;
      return new Response(body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    } catch (error) {
      // Network-level failure during the request or the body read
      // (ETIMEDOUT / "fetch failed" / "terminated"). Retry if budget remains.
      lastError = error;
      if (attempt < retries) {
        await delay(backoffMs * (attempt + 1));
        continue;
      }
    }
  }
  // Exhausted retries — rethrow the original so callers and Sentry still see
  // the real failure.
  throw lastError;
}
