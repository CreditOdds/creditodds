// Next.js instrumentation hook. Runs once when the server/edge runtime boots and
// wires up Sentry for the matching runtime. Also exports onRequestError so that
// errors thrown in App Router server components / route handlers are captured.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
