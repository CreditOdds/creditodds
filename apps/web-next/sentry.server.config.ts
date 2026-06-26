// Sentry configuration for the Node.js server runtime.
// Loaded by src/instrumentation.ts via register() when the server boots.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from '@sentry/nextjs';
import { isTransientNetworkError } from '@/lib/transientNetworkError';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only send events when a DSN is configured (i.e. in deployed environments).
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  // Performance tracing. Tune down if event volume/cost grows.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  // Surface noisy local logs without shipping them.
  debug: false,

  // Drop self-healing transient network blips (fetchWithRetry + ISR already
  // recover from these, so users never see them and they aren't actionable).
  beforeSend(event, hint) {
    if (isTransientNetworkError(hint?.originalException)) {
      return null;
    }
    return event;
  },
});
