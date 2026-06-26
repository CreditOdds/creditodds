import { describe, expect, it } from "vitest";
import { isTransientNetworkError } from "./transientNetworkError";

describe("isTransientNetworkError", () => {
  it("matches a bare transient message", () => {
    expect(isTransientNetworkError(new TypeError("fetch failed"))).toBe(true);
    expect(isTransientNetworkError(new TypeError("terminated"))).toBe(true);
  });

  it("matches the real undici cause chain (fetch failed -> SocketError)", () => {
    // Shape Node produces: TypeError("fetch failed") with .cause = the SocketError.
    const socketErr = Object.assign(new Error("other side closed"), {
      code: "UND_ERR_SOCKET",
    });
    const fetchErr = Object.assign(new TypeError("fetch failed"), { cause: socketErr });
    expect(isTransientNetworkError(fetchErr)).toBe(true);
  });

  it("matches by error code", () => {
    expect(isTransientNetworkError(Object.assign(new Error("read"), { code: "ECONNRESET" }))).toBe(
      true,
    );
  });

  it("does NOT match a real application error", () => {
    expect(isTransientNetworkError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isTransientNetworkError(new TypeError("x is not a function"))).toBe(false);
  });

  it("handles null / non-error input safely", () => {
    expect(isTransientNetworkError(null)).toBe(false);
    expect(isTransientNetworkError(undefined)).toBe(false);
    expect(isTransientNetworkError("just a string")).toBe(false);
  });

  it("does not loop forever on a circular cause chain", () => {
    const a = new Error("boom") as Error & { cause?: unknown };
    const b = new Error("bang") as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    expect(isTransientNetworkError(a)).toBe(false);
  });
});
