import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./fetchWithRetry";

const res = (status: number) => new Response(null, { status });

afterEach(() => {
  vi.restoreAllMocks();
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

  it("does not attach a signal to the first attempt", async () => {
    // Attempt 1 must stay memoizable by Next's per-render dedupe layer —
    // concurrent components fetching the same URL should share one request.
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithRetry("https://x.test", undefined, { backoffMs: 0 });

    expect(fetchMock.mock.calls[0][1]).toBeUndefined();
  });

  it("attaches a fresh non-aborted signal to retries, preserving other init fields", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);
    const init = { headers: { "x-a": "1" }, next: { revalidate: 300 } } as RequestInit;

    await fetchWithRetry("https://x.test", init, { backoffMs: 0 });

    // First attempt: init passed through untouched.
    expect(fetchMock.mock.calls[0][1]).toBe(init);
    // Retry: same init fields plus the dedupe-bypass signal.
    const retryInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(retryInit.headers).toEqual({ "x-a": "1" });
    expect((retryInit as { next?: unknown }).next).toEqual({ revalidate: 300 });
    expect(retryInit.signal).toBeInstanceOf(AbortSignal);
    expect(retryInit.signal!.aborted).toBe(false);
  });

  it("keeps a caller-provided signal on every attempt", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const init: RequestInit = { signal: controller.signal };

    await fetchWithRetry("https://x.test", init, { backoffMs: 0 });

    expect(fetchMock.mock.calls[0][1]).toBe(init);
    expect((fetchMock.mock.calls[1][1] as RequestInit).signal).toBe(controller.signal);
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

  it("still memoizes the successful first attempt for other same-render callers", async () => {
    const upstream = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", createDedupeFetchReplica(upstream as unknown as typeof fetch));

    const a = await fetchWithRetry("https://x.test", undefined, { backoffMs: 0 });
    const b = await fetchWithRetry("https://x.test", undefined, { backoffMs: 0 });

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
