import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./fetchWithRetry";

const res = (status: number) => new Response(null, { status });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithRetry", () => {
  it("returns immediately on success without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchWithRetry("https://x.test", undefined, { backoffMs: 0 });

    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient network error then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchWithRetry("https://x.test", undefined, { backoffMs: 0 });

    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(503))
      .mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchWithRetry("https://x.test", undefined, { backoffMs: 0 });

    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries when the response body terminates mid-stream", async () => {
    // fetch() resolves 200, but reading the body throws "terminated" (undici
    // keep-alive socket drop) — must retry, not surface to the caller.
    const terminating = {
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      arrayBuffer: () => Promise.reject(new TypeError("terminated")),
    } as unknown as Response;
    const good = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const fetchMock = vi.fn().mockResolvedValueOnce(terminating).mockResolvedValue(good);
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchWithRetry("https://x.test", undefined, { backoffMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await out.json()).toEqual({ ok: true });
  });

  it("retries a 5xx whose body can never be cancelled or read", async () => {
    // Under Next.js's patched fetch the response is one branch of a tee'd
    // stream, and a branch's cancel() only settles once both branches are
    // cancelled — which Next never does. Discarding the failed body must not be
    // able to block the retry loop, or a real 5xx hangs the whole SSR render.
    const neverSettles = () => new Promise<never>(() => {});
    const stuck = {
      status: 503,
      statusText: "Service Unavailable",
      headers: new Headers(),
      body: { cancel: neverSettles },
      arrayBuffer: neverSettles,
    } as unknown as Response;
    const good = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const fetchMock = vi.fn().mockResolvedValueOnce(stuck).mockResolvedValue(good);
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchWithRetry("https://x.test", undefined, { backoffMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await out.json()).toEqual({ ok: true });
  }, 2000);

  it("returns the 5xx to the caller once retries are exhausted", async () => {
    // A fresh Response per call, as real fetch gives — the retried attempts
    // discard their bodies, so a single shared Response would be unusable.
    const fetchMock = vi.fn(async () => new Response("upstream boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchWithRetry("https://x.test", undefined, { retries: 2, backoffMs: 0 });

    expect(out.status).toBe(500);
    expect(await out.text()).toBe("upstream boom");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404));
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchWithRetry("https://x.test", undefined, { backoffMs: 0 });

    expect(out.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rethrows the original error after exhausting retries", async () => {
    const err = new TypeError("fetch failed");
    const fetchMock = vi.fn().mockRejectedValue(err);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRetry("https://x.test", undefined, { retries: 2, backoffMs: 0 }),
    ).rejects.toBe(err);
    // initial attempt + 2 retries
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("bounds every attempt and preserves Next cache options", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);
    const init = { headers: { "x-a": "1" }, next: { revalidate: 300 } } as RequestInit;
    await fetchWithRetry("https://x.test", init, { backoffMs: 0 });
    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers).toEqual(init.headers);
      expect(call[1].next).toEqual({ revalidate: 300 });
      expect(call[1].signal).toBeInstanceOf(AbortSignal);
    }
    expect(fetchMock.mock.calls[0][1].signal).not.toBe(fetchMock.mock.calls[1][1].signal);
  });

  it.each(['headers', 'body'])("aborts stalled %s and stops within the total budget", async phase => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    const fetchMock = vi.fn().mockImplementation(() => phase === 'headers' ? never : Promise.resolve({ status: 200, arrayBuffer: () => never }));
    vi.stubGlobal('fetch', fetchMock);
    const result = expect(fetchWithRetry('https://x.test', undefined, { attemptTimeoutMs: 100, totalTimeoutMs: 250, backoffMs: 0 })).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(250);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(call => call[1].signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['request', 'backoff'])("honors caller cancellation during %s without retrying", async phase => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => phase === 'request' ? new Promise(() => {}) : Promise.reject(new Error('network')));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const error = new Error('Caller left');
    const result = expect(fetchWithRetry('https://x.test', { signal: controller.signal })).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort(error);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start work for an already cancelled caller', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchWithRetry('https://x.test', { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry mutations', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ambiguous write'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchWithRetry('https://x.test', { method: 'POST' }, { backoffMs: 0 })).rejects.toThrow('ambiguous write');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not let backoff outlive the total deadline', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetchMock);
    const result = expect(fetchWithRetry('https://x.test', undefined, { totalTimeoutMs: 50, backoffMs: 1000 })).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(50);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

});

// Replica of Next's per-render fetch memoization, mirroring
// next/dist/server/lib/dedupe-fetch.js (the real module can't run under vitest:
// it resolves `react.cache` from Next's vendored react-server build). Same
// observable semantics: the first settled promise per URL is cached — including
// rejections — later callers get clones of the first response, and any
// options.signal opts out entirely.
function createDedupeFetchReplica(originalFetch: typeof fetch): typeof fetch {
  const entries = new Map<string, Promise<Response>>();
  return ((resource: string | URL, options?: RequestInit) => {
    if (options && options.signal) {
      return originalFetch(resource, options);
    }
    const url = String(resource);
    const cached = entries.get(url);
    if (cached) {
      return cached.then((response) => response.clone());
    }
    const promise = originalFetch(resource, options);
    entries.set(url, promise);
    return promise.then((response) => response.clone());
  }) as typeof fetch;
}

describe("fetchWithRetry under Next's per-render fetch memoization", () => {
  it("retries a 5xx over the network instead of replaying the memoized 500", async () => {
    // Regression test for the production 2026-07-28 failure: attempt 1 got a
    // 500, and every retry received a clone of that same memoized 500 without
    // any network request, so a single upstream blip failed the SSR render.
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", createDedupeFetchReplica(upstream as unknown as typeof fetch));

    const out = await fetchWithRetry("https://x.test", undefined, { backoffMs: 0 });

    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ ok: true });
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("retries a network error over the network instead of replaying the memoized rejection", async () => {
    // dedupe-fetch caches rejected promises too, so without the bypass every
    // retry would re-throw attempt 1's error.
    const upstream = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", createDedupeFetchReplica(upstream as unknown as typeof fetch));

    const out = await fetchWithRetry("https://x.test", undefined, { backoffMs: 0 });

    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ ok: true });
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("uses independent cancellable requests for same-render callers", async () => {
    const upstream = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", createDedupeFetchReplica(upstream as unknown as typeof fetch));

    const a = await fetchWithRetry("https://x.test", undefined, { backoffMs: 0 });
    const b = await fetchWithRetry("https://x.test", undefined, { backoffMs: 0 });

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
  });
});
