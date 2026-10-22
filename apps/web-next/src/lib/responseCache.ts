import { unstable_cache } from 'next/cache';
import type { FetchRetryOptions } from './fetchWithRetry';

type Transport = (input: string | URL, init?: RequestInit, opts?: FetchRetryOptions) => Promise<Response>;
interface StoredResponse {
  body: string;
  status: number;
  statusText: string;
  headers: [string, string][];
}

// Only explicitly cached, public reads may share work between requests.
export function canCacheResponse(init?: RequestInit): boolean {
  const revalidate = init?.next?.revalidate;
  return typeof window === 'undefined' &&
    (revalidate === false || (typeof revalidate === 'number' && revalidate > 0)) &&
    ['GET', 'HEAD'].includes((init?.method ?? 'GET').toUpperCase()) &&
    !init?.body && (!init?.credentials || init.credentials === 'omit') &&
    (!init?.cache || init.cache === 'force-cache' || init.cache === 'default') &&
    [...new Headers(init?.headers).keys()].every(key => key === 'accept') &&
    Object.keys(init ?? {}).every(key => ['next', 'signal', 'method', 'headers', 'credentials', 'cache'].includes(key));
}

function encode(bytes: ArrayBuffer): string {
  const array = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < array.length; i += 8192) binary += String.fromCharCode(...array.subarray(i, i + 8192));
  return btoa(binary);
}

function response(data: StoredResponse, method: string): Response {
  const body = method === 'HEAD' || [204, 205, 304].includes(data.status)
    ? null : Uint8Array.from(atob(data.body), char => char.charCodeAt(0));
  return new Response(body, { status: data.status, statusText: data.statusText, headers: data.headers });
}

class UncacheableResponse extends Error {
  constructor(readonly data: StoredResponse) {
    super(`Upstream response is not cacheable: ${data.status}`);
  }
}

// Share only in-flight transport work, not settled responses or rejected
// promises. Next owns persistence, expiry, tags, and stale-on-refresh-error.
const pending = new Map<string, Promise<StoredResponse>>();

export async function readCachedResponse(input: string | URL, init: RequestInit, opts: FetchRetryOptions, transport: Transport): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = [...new Headers(init.headers).entries()];
  const identity = JSON.stringify([String(input), method, headers, opts, init.next]);
  const cached = unstable_cache(async () => {
    const existing = pending.get(identity);
    if (existing) return existing;
    const work = (async () => {
      // No caller signal or next.revalidate enters the shared operation. Its
      // own deadline remains active in foreground AND background refreshes.
      const res = await transport(input, { method, headers, cache: 'no-store' }, opts);
      const bytes = await res.arrayBuffer();
      // A truncated/malformed JSON success must not replace last-good data.
      if (method !== 'HEAD' && res.ok && ![204, 205].includes(res.status) &&
          /\bapplication\/(?:[\w.+-]*\+)?json\b/i.test(res.headers.get('content-type') ?? '')) {
        JSON.parse(new TextDecoder().decode(bytes));
      }
      const data: StoredResponse = {
        body: encode(bytes), status: res.status,
        statusText: res.statusText, headers: [...res.headers.entries()],
      };
      // A genuine 404 replaces deleted content. Transient failures must never
      // overwrite a usable cached value. On a cold miss preserve HTTP semantics.
      if ((!res.ok && res.status !== 404) || res.headers.has('set-cookie') ||
          /\b(private|no-store)\b/i.test(res.headers.get('cache-control') ?? '')) {
        throw new UncacheableResponse(data);
      }
      return data;
    })();
    // Avoid an unbounded map for arbitrary public URLs under heavy concurrency.
    const tracked = pending.size < 256;
    if (tracked) pending.set(identity, work);
    try { return await work; }
    finally { if (tracked) pending.delete(identity); }
  }, ['bounded-public-response-v1', identity], {
    revalidate: init.next?.revalidate, tags: init.next?.tags,
  });
  try {
    return response(await cached(), method);
  } catch (error) {
    if (error instanceof UncacheableResponse) return response(error.data, method);
    throw error;
  }
}
