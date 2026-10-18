// Recognises the Next.js invariant that vulnerability scanners trip by POSTing a
// fake server-action id (e.g. `Next-Action: cachefn`) at a route that 404s. Next
// renders _not-found for the action request, the cached not-found page is HTML
// rather than RSC, and it throws "Invariant: Expected RSC response, got
// text/plain" instead of returning the 404 (still unfixed as of Next 16.4.2).
//
// The app defines no server actions ("use server"), so the only POST that can
// reach a page render is a probe like this. Real RSC navigations are GETs, so
// the POST gate keeps a genuine RSC/content-type bug on a normal render
// reporting. Used by beforeSend in sentry.server.config.ts.
export const BOGUS_SERVER_ACTION_SIGNATURE = 'Expected RSC response';

export function isBogusServerActionError(
  error: unknown,
  method: string | undefined,
): boolean {
  if (method?.toUpperCase() !== 'POST') return false;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.includes(BOGUS_SERVER_ACTION_SIGNATURE);
}
