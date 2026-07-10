// Recognises benign client-side errors that are noise rather than real bugs.
//
// The main offender is Firebase Analytics' IndexedDB access. When a user
// navigates away or reloads, the browser tears down the IndexedDB connection
// while Firebase still has a read/write transaction in flight. The transaction
// is aborted ("The transaction was aborted..." / "the database connection is
// closing"), Firebase rethrows it as an AbortError (DOMException code 20), and
// because nothing awaits that internal promise it surfaces to Sentry as an
// unhandled rejection. The page itself loads fine — these are not actionable,
// so we drop them in instrumentation-client.ts (mirrors the server-side
// self-healing-network filter in transientNetworkError.ts).
//
// Mobile Safari can also surface WebExtension content-script messaging failures
// as page-level unhandled rejections even though the page never calls the
// extension API. These are user-extension/WebKit noise, not app failures.
const BENIGN_CLIENT_SIGNATURES = [
  'The transaction was aborted',
  'database connection is closing',
  'idb-get',
  'idb-set',
  'IndexedDB',
];

const BENIGN_EXTENSION_SIGNATURES = [
  'Invalid call to runtime.sendMessage(). Tab not found.',
];

// DOMException.ABORT_ERR — the numeric code carried by AbortErrors.
const ABORT_ERR_CODE = 20;

export function isBenignClientError(error: unknown): boolean {
  // Walk the cause chain in case Firebase wraps the original DOMException.
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth++) {
    const e = current as {
      name?: unknown;
      message?: unknown;
      code?: unknown;
      cause?: unknown;
    };
    const name = typeof e.name === 'string' ? e.name : '';
    const message = typeof e.message === 'string' ? e.message : '';
    const isAbort = name === 'AbortError' || e.code === ABORT_ERR_CODE;

    if (BENIGN_EXTENSION_SIGNATURES.some((sig) => message.includes(sig))) {
      return true;
    }

    if (isAbort) {
      // Bare "AbortError: AbortError" (Firebase's rethrow loses the original
      // message) or any of the IndexedDB teardown signatures.
      if (
        message === 'AbortError' ||
        BENIGN_CLIENT_SIGNATURES.some((sig) => message.includes(sig))
      ) {
        return true;
      }
    }
    current = e.cause;
  }
  return false;
}
