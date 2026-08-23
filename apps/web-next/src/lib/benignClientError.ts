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
// WebKit also drops the page's connection to the IndexedDB server outright
// when it suspends a backgrounded tab (tab switch, screen lock, memory
// pressure). On resume, Firebase's internal IDB operations reject with
// "UnknownError: Connection to Indexed Database server lost. Refresh the
// page to try again" — name/code don't match the AbortError gate below, so
// that signature is matched unconditionally. The page itself is unaffected.
//
// WebKit has a second, distinct teardown signature: "InvalidStateError:
// Database is closing/hidden" (CREDITODDS-JAVASCRIPT-NEXTJS-1G), raised when a
// page opens IndexedDB while Mobile Safari is suspending the tab. It is neither
// an AbortError nor a connection-lost error, so it needs its own entry.
// The auth-side consequence of this one was real rather than cosmetic —
// Firebase let it escape from initializeCurrentUser and wedged
// onAuthStateChanged — and that is fixed at the source in auth/firebase.ts by
// putting localStorage ahead of IndexedDB. What survives is the rejection
// itself: Firebase Analytics/Installations still touch IndexedDB, and their
// internal promises have no handler we can attach to, so the same message can
// still surface as unhandled noise with nothing to act on.
//
// A third WebKit teardown signature: "UnknownError: Database deleted by
// request of the user" (CREDITODDS-JAVASCRIPT-NEXTJS-1H). Safari deletes the
// page's IndexedDB while the page still holds a connection — the user clearing
// website data, or ITP evicting script-writable storage — and Firebase's
// in-flight idb-get/idb-set operations reject with this message (followed by
// "database connection is closing" as the doomed connection winds down). Same
// name/code as connection-lost (UnknownError, code 0), so the AbortError gate
// misses it and it needs its own unconditional entry. Nothing to act on: the
// deletion is the browser/user's doing and Firebase falls back gracefully.
//
// Firebase Installations also rejects with "installations/app-offline" when
// navigator.onLine is false during Analytics init. getAnalytics() never awaits
// that internal registration promise, so a visitor who loses connectivity
// mid-load produces an unhandled rejection even though the (already rendered)
// page is fine. Only their device being offline triggers it — not actionable.
//
// Mobile Safari can also surface WebExtension content-script messaging failures
// as page-level unhandled rejections even though the page never calls the
// extension API. These are user-extension/WebKit noise, not app failures.
//
// A separate shape entirely: an unhandled rejection whose reason is a bare DOM
// Event (Sentry: "Event `Event` (type=error) captured as promise rejection",
// CREDITODDS-JAVASCRIPT-NEXTJS-12). Audit of everything shipped on the page
// (2026-07-26) found no promise that rejects with a raw event — our own code
// doesn't, and Turbopack's chunk loader rejects with undefined, Next's router
// wraps chunk failures in real Errors, posthog-js reports loader failures via
// callbacks, and Firebase rejects DOMExceptions/FirebaseErrors/strings. So an
// Event-as-rejection-reason can only come from foreign main-world code
// (browser extensions, injected third-party scripts), and it is inherently
// unactionable: a bare Event carries no stack, no message, and no URL.
// ErrorEvent is deliberately NOT matched — it carries a real message/error
// payload worth reporting.
//
// Three more shapes come from code that isn't ours at all:
//
// 1. "Object Not Found Matching Id:N, MethodName:update, ParamCount:4"
//    (CREDITODDS-JAVASCRIPT-NEXTJS-16), rejected as a bare STRING rather than
//    an Error. That wording is the CefSharp .NET/Chromium host bridge failing
//    to resolve a JS object it registered — it is emitted by embedded-Chromium
//    crawlers, chiefly Microsoft Outlook's SafeLinks scanner following a link
//    from an email. No browser or library we ship produces it, the id and
//    method name vary per hit, and there is no stack. Bot traffic, not users.
//
// 2. "Converting circular structure to JSON ... property '__reactFiber$...'"
//    (CREDITODDS-JAVASCRIPT-NEXTJS-17): an injected script has monkey-patched
//    Node.prototype.appendChild and JSON.stringify's the node React hands it
//    during commit. React attaches its fiber to every DOM node it owns
//    (`__reactFiber$<random>`), and a fiber points back at its stateNode, so
//    stringifying any mounted node always cycles. The throw happens inside the
//    extension's wrapper — every frame above our chunk is `<anonymous>` — so
//    there is nothing to fix on our side. Both substrings are required: a
//    genuine circular-structure bug in our own code would not be walking a
//    React fiber.
//
// 3. "Unable to load image data:image/svg+xml;base64,..."
//    (CREDITODDS-JAVASCRIPT-NEXTJS-1F), rejected as a bare STRING from
//    Firefox iOS. The base64 payload decodes to one of our inline <svg>
//    elements (the FollowXCallout X logo) — but we never serialise inline
//    SVGs to data URIs or load them via Image(), and no code we ship says
//    "Unable to load image" (nor could our chunks appear in a stack: string
//    rejections carry no frames, which is also why hasOnlyForeignFrames
//    can't catch this). Firefox iOS injects content scripts that walk the
//    page's images (metadata/thumbnail extraction), and inline SVGs get
//    re-encoded as data: URIs whose load can fail inside the injected
//    context. The "data:" scheme is required in the signature so a
//    hypothetical real image-load failure pointing at an https URL stays
//    reportable.
//
// Finally, hasOnlyForeignFrames (below) drops exceptions by stack shape rather
// than message: every frame lacks a resolvable script URL. See its comment.
const BENIGN_CLIENT_SIGNATURES = [
  'The transaction was aborted',
  'database connection is closing',
  'idb-get',
  'idb-set',
  'IndexedDB',
];

// Matched on any error, regardless of name/code (unlike the abort-gated
// signatures above).
const BENIGN_ANY_ERROR_SIGNATURES = [
  'Invalid call to runtime.sendMessage(). Tab not found.',
  'Connection to Indexed Database server lost',
  'Database deleted by request of the user',
  'Database is closing/hidden',
  'installations/app-offline',
  'Object Not Found Matching Id:',
  'Unable to load image data:',
];

// Every substring here must be present for the error to count as benign. Used
// for shapes whose message alone is too generic to drop outright.
const BENIGN_COMPOUND_SIGNATURES = [
  ['Converting circular structure to JSON', '__reactFiber$'],
];

// DOMException.ABORT_ERR — the numeric code carried by AbortErrors.
const ABORT_ERR_CODE = 20;

// True when the rejection reason is a bare DOM Event (see block comment above).
// Guarded lookups because this module is also exercised in Node-based tests,
// where Event exists but ErrorEvent does not.
function isBareEventRejection(error: unknown): boolean {
  if (typeof Event === 'undefined' || !(error instanceof Event)) {
    return false;
  }
  if (typeof ErrorEvent !== 'undefined' && error instanceof ErrorEvent) {
    return false;
  }
  return true;
}

export function isBenignClientError(error: unknown): boolean {
  if (isBareEventRejection(error)) {
    return true;
  }

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
    // A promise can reject with a bare string (no Error wrapper), in which case
    // the value itself is the only message we get.
    const message =
      typeof current === 'string'
        ? current
        : typeof e.message === 'string'
          ? e.message
          : '';
    const isAbort = name === 'AbortError' || e.code === ABORT_ERR_CODE;

    if (BENIGN_ANY_ERROR_SIGNATURES.some((sig) => message.includes(sig))) {
      return true;
    }

    if (
      BENIGN_COMPOUND_SIGNATURES.some((sigs) =>
        sigs.every((sig) => message.includes(sig)),
      )
    ) {
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

// Drops exceptions where no stack frame carries a resolvable script URL —
// code that reached the page without ever loading a script we ship or could
// even name (injected webview scripts, translated-page rewriters, extension
// eval blobs). First instance: CREDITODDS-JAVASCRIPT-NEXTJS-18, a
// "RangeError: Maximum call stack size exceeded" from the Google iOS app with
// in-page translation active (clicked element was `a > font > font` — the
// translator's text-node wrappers), whose entire stack was one frame with no
// filename ("Line 189" of undefined). Nothing in the apply-click path
// recurses, and without a single named frame there is nothing to symbolicate
// or fix.
//
// Deliberately NOT matched on the message: "Maximum call stack size exceeded"
// is exactly what a genuine infinite recursion in our own code would say, and
// such a bug would carry frames pointing at our chunks, so it passes this
// filter untouched. At least one frame is required — frame-less events
// ("Script error." and friends) are a different shape and stay reportable.

// Filenames browsers substitute when a frame has no real script URL.
const FOREIGN_FRAME_FILENAMES = new Set([
  '',
  '<anonymous>',
  'native',
  '[native code]',
  'undefined',
]);

interface FrameLike {
  filename?: unknown;
  abs_path?: unknown;
}

interface SentryEventLike {
  exception?: {
    values?: Array<{ stacktrace?: { frames?: unknown[] } | null } | null>;
  } | null;
}

function isForeignFrame(frame: FrameLike): boolean {
  for (const value of [frame.filename, frame.abs_path]) {
    if (typeof value === 'string' && !FOREIGN_FRAME_FILENAMES.has(value)) {
      return false;
    }
  }
  return true;
}

export function hasOnlyForeignFrames(
  event: SentryEventLike | null | undefined,
): boolean {
  const values = event?.exception?.values;
  if (!Array.isArray(values)) return false;
  let frameCount = 0;
  for (const value of values) {
    const frames = value?.stacktrace?.frames;
    if (!Array.isArray(frames)) continue;
    for (const frame of frames) {
      frameCount++;
      if (
        frame != null &&
        typeof frame === 'object' &&
        !isForeignFrame(frame as FrameLike)
      ) {
        return false;
      }
    }
  }
  return frameCount > 0;
}
