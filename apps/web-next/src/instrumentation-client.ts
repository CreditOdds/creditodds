// Sentry configuration for the browser. Next.js loads this automatically on the
// client (replaces the legacy sentry.client.config.ts).
// Session replay is intentionally NOT enabled here — PostHog already provides
// session replay for the site, so adding Sentry Replay would be redundant cost
// and an extra CSP/worker surface.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
//
// PostHog (product analytics + session replay) is initialized here too. Next.js
// loads exactly one instrumentation-client file, so both SDKs must share it —
// the PostHog wizard's separate root-level file was merged in here.
import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';
import {
  hasOnlyForeignFrames,
  isBenignClientError,
} from '@/lib/benignClientError';

posthog.init('phc_oPFKvUCGmpZdRPug7TvYDRRSZpJ9oUmLZphkjrSV3fCd', {
  // Managed first-party reverse proxy configured in Route 53.
  api_host: 'https://relay.creditodds.com',
  ui_host: 'https://us.posthog.com',
  defaults: '2026-05-30',
  capture_exceptions: true,
  debug: process.env.NODE_ENV === 'development',
});

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Production only: local dev servers (and Claude worktrees, which copy
  // .env.local and therefore the DSN) would otherwise stream HMR/Fast-Refresh
  // noise, mid-edit parse errors, and stale-chunk ReferenceErrors into Sentry.
  // To deliberately test Sentry locally, opt in with NEXT_PUBLIC_SENTRY_DEV=1.
  enabled:
    Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) &&
    (process.env.NODE_ENV === 'production' ||
      process.env.NEXT_PUBLIC_SENTRY_DEV === '1'),

  // Performance tracing. Tune down if event volume/cost grows.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  debug: false,

  // Drop benign teardown noise — chiefly Firebase Analytics' IndexedDB
  // AbortErrors when the user navigates/reloads mid-transaction. The page
  // loads fine; these aren't actionable (mirrors the server-side
  // self-healing-network filter in sentry.server.config.ts). Also drop
  // exceptions whose stack never touches a named script — foreign injected
  // code (see hasOnlyForeignFrames in benignClientError.ts).
  beforeSend(event, hint) {
    if (isBenignClientError(hint?.originalException)) {
      return null;
    }
    if (hasOnlyForeignFrames(event)) {
      return null;
    }
    return event;
  },
});

// Required for navigation (route change) instrumentation in the App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
