// Sentry configuration for the Node.js server runtime.
// Loaded by src/instrumentation.ts via register() when the server boots.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from '@sentry/nextjs';
import { isTransientNetworkError } from '@/lib/transientNetworkError';
import { isBogusServerActionError } from '@/lib/bogusServerActionError';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only send events when a DSN is configured, and only in production — local
  // dev SSR errors (worktrees copy .env.local, so the DSN is present locally)
  // are noise. Opt in locally with NEXT_PUBLIC_SENTRY_DEV=1 to test Sentry.
  enabled:
    Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) &&
    (process.env.NODE_ENV === 'production' ||
      process.env.NEXT_PUBLIC_SENTRY_DEV === '1'),

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
    // Drop scanner probes that POST a fake server-action id (we have none).
    // Fall back to the "POST /route" transaction name if request data is absent.
    const method = event.request?.method ?? event.transaction?.split(' ')[0];
    if (isBogusServerActionError(hint?.originalException, method)) {
      return null;
    }
    return event;
  },
});
