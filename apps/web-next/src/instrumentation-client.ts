// Sentry configuration for the browser. Next.js loads this automatically on the
// client (replaces the legacy sentry.client.config.ts).
// Session replay is intentionally NOT enabled here — LogRocket already provides
// session replay for the site, so adding Sentry Replay would be redundant cost
// and an extra CSP/worker surface.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  // Performance tracing. Tune down if event volume/cost grows.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  debug: false,
});

// Required for navigation (route change) instrumentation in the App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
