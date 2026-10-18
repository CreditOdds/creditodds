import { describe, expect, it } from "vitest";
import { isBogusServerActionError } from "./bogusServerActionError";

// Shape Next throws (InvariantError prefixes "Invariant: " and appends the bug note).
const invariant = () =>
  new Error(
    "Invariant: Expected RSC response, got text/plain. This is a bug in Next.js.",
  );

describe("isBogusServerActionError", () => {
  it("matches the invariant on a POST (scanner sending a fake Next-Action)", () => {
    expect(isBogusServerActionError(invariant(), "POST")).toBe(true);
    expect(isBogusServerActionError(invariant(), "post")).toBe(true);
  });

  it("still reports the same invariant on a GET render", () => {
    expect(isBogusServerActionError(invariant(), "GET")).toBe(false);
  });

  it("still reports when the method is unknown", () => {
    expect(isBogusServerActionError(invariant(), undefined)).toBe(false);
  });

  it("does not match unrelated POST errors", () => {
    expect(isBogusServerActionError(new Error("Invariant: something else"), "POST")).toBe(
      false,
    );
    expect(isBogusServerActionError(null, "POST")).toBe(false);
    expect(isBogusServerActionError("Expected RSC response", "POST")).toBe(false);
  });
});
