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
