import { describe, expect, it } from "vitest";
import { isBenignClientError } from "./benignClientError";

// Mimics a browser DOMException without depending on the DOM lib in tests.
const domException = (message: string, name = "AbortError", code = 20) =>
  ({ name, message, code }) as unknown;

describe("isBenignClientError", () => {
  it("drops Firebase IndexedDB transaction-aborted errors", () => {
    expect(
      isBenignClientError(
        domException(
          "The transaction was aborted, so the request cannot be fulfilled.",
        ),
      ),
    ).toBe(true);
  });

  it("drops the bare 'AbortError: AbortError' rethrow", () => {
    expect(isBenignClientError(domException("AbortError"))).toBe(true);
  });

  it("drops 'database connection is closing' aborts", () => {
    expect(
      isBenignClientError(
        domException(
          "Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.",
        ),
      ),
    ).toBe(true);
  });

  it("walks the cause chain when Firebase wraps the DOMException", () => {
    const wrapped = {
      name: "Error",
      message: "wrapped",
      cause: domException("The transaction was aborted"),
    };
    expect(isBenignClientError(wrapped)).toBe(true);
  });

  it("drops Safari/WebExtension runtime.sendMessage tab-missing noise", () => {
    expect(
      isBenignClientError(
        new Error("Invalid call to runtime.sendMessage(). Tab not found."),
      ),
    ).toBe(true);
  });

  it("drops WebKit's IDB-server-connection-lost noise (DOMException shape)", () => {
    expect(
      isBenignClientError(
        domException(
          "Connection to Indexed Database server lost. Refresh the page to try again",
          "UnknownError",
          0,
        ),
      ),
    ).toBe(true);
  });

  it("drops WebKit's IDB-server-connection-lost noise (wrapped-message shape)", () => {
    expect(
      isBenignClientError(
        new Error(
          "UnknownError: Connection to Indexed Database server lost. Refresh the page to try again",
        ),
      ),
    ).toBe(true);
  });

  it("drops Firebase Installations app-offline noise", () => {
    // FirebaseError shape: name "FirebaseError", code "installations/app-offline".
    expect(
      isBenignClientError({
        name: "FirebaseError",
        code: "installations/app-offline",
        message:
          "Installations: Could not process request. Application offline. (installations/app-offline).",
      }),
    ).toBe(true);
  });

  it("keeps other FirebaseErrors", () => {
    expect(
      isBenignClientError({
        name: "FirebaseError",
        code: "installations/request-failed",
        message:
          "Installations: Create Installation request failed with error (installations/request-failed).",
      }),
    ).toBe(false);
  });

  it("keeps unrelated UnknownErrors", () => {
    expect(
      isBenignClientError(
        domException("An internal error was encountered.", "UnknownError", 0),
      ),
    ).toBe(false);
  });

  it("keeps a real AbortError that isn't IndexedDB-related", () => {
    // e.g. a genuine fetch abort we'd still want to see — bare name only is
    // benign, but a descriptive non-idb abort message is not matched.
    expect(
      isBenignClientError(domException("The user aborted a request.")),
    ).toBe(false);
  });

  it("keeps unrelated errors", () => {
    expect(
      isBenignClientError(
        domException("Cannot read properties of undefined", "TypeError", 0),
      ),
    ).toBe(false);
  });

  it("keeps unrelated extension API failures", () => {
    expect(
      isBenignClientError(
        new Error("Invalid call to runtime.sendMessage(). Permission denied."),
      ),
    ).toBe(false);
  });

  it("handles null/undefined safely", () => {
    expect(isBenignClientError(null)).toBe(false);
    expect(isBenignClientError(undefined)).toBe(false);
  });
});
