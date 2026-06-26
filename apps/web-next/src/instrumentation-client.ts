// Sentry configuration for the browser. Next.js loads this automatically on the
// client (replaces the legacy sentry.client.config.ts).
// Session replay is intentionally NOT enabled here — LogRocket already provides
// session replay for the site, so adding Sentry Replay would be redundant cost
// and an extra CSP/worker surface.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from '@sentry/nextjs';
import { isBenignClientError } from '@/lib/benignClientError';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  // Performance tracing. Tune down if event volume/cost grows.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  debug: false,

  // Drop benign teardown noise — chiefly Firebase Analytics' IndexedDB
  // AbortErrors when the user navigates/reloads mid-transaction. The page
  // loads fine; these aren't actionable (mirrors the server-side
  // self-healing-network filter in sentry.server.config.ts).
  beforeSend(event, hint) {
    if (isBenignClientError(hint?.originalException)) {
      return null;
    }
    return event;
  },
});

// Required for navigation (route change) instrumentation in the App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
