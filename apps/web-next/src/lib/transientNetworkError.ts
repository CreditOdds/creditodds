// Recognises transient network failures between our SSR server and the upstream
// CDN/API. These are self-healing — fetchWithRetry retries them and ISR keeps
// serving the last-good cached page — so the residual ones that still reach
// Sentry are not individually actionable and get dropped (see
// sentry.server.config.ts). A genuine sustained outage still surfaces as
// elevated 5xx/latency elsewhere.
export const TRANSIENT_NETWORK_SIGNATURES = [
  'fetch failed',
  'terminated',
  'other side closed',
  'Client network socket disconnected',
  'socket hang up',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
];

export function isTransientNetworkError(error: unknown): boolean {
  // Walk the cause chain — undici nests the underlying SocketError under the
  // TypeError("fetch failed") as `.cause`.
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth++) {
    const e = current as { message?: unknown; code?: unknown; cause?: unknown };
    const message = typeof e.message === 'string' ? e.message : '';
    const code = typeof e.code === 'string' ? e.code : '';
    if (TRANSIENT_NETWORK_SIGNATURES.some((sig) => message.includes(sig) || code === sig)) {
      return true;
    }
    current = e.cause;
  }
  return false;
}
