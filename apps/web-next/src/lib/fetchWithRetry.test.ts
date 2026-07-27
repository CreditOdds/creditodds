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
});
