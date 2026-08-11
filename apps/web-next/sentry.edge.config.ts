// Sentry configuration for the Edge runtime (middleware, edge routes).
// Loaded by src/instrumentation.ts via register() when the edge runtime boots.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Production only (see instrumentation-client.ts); NEXT_PUBLIC_SENTRY_DEV=1
  // re-enables locally for deliberate Sentry testing.
  enabled:
    Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) &&
    (process.env.NODE_ENV === 'production' ||
      process.env.NEXT_PUBLIC_SENTRY_DEV === '1'),

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  debug: false,
});
