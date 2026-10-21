// Browser reports are untrusted. Bound body size, read time, and log volume;
// retain no document URLs, query strings, script samples, cookies or IPs.
const MAX_BYTES = 16 * 1024;
const DIRECTIVES = new Set(['default-src', 'script-src', 'script-src-elem', 'script-src-attr', 'style-src', 'style-src-elem', 'style-src-attr', 'img-src', 'connect-src', 'font-src', 'frame-src', 'frame-ancestors', 'object-src', 'base-uri', 'form-action', 'worker-src', 'manifest-src']);
let windowStart = 0;
let reportsLogged = 0;

export async function POST(request: Request): Promise<Response> {
  const type = request.headers.get('content-type')?.split(';')[0].trim();
  if (!['application/csp-report', 'application/reports+json', 'application/json'].includes(type ?? '')) return new Response(null, { status: 415 });
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return new Response(null, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) throw new RangeError('Report too large');
          chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        return JSON.parse(new TextDecoder().decode(bytes));
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Report timeout')), 2000); }),
    ]);
    const reports = Array.isArray(raw) ? raw.slice(0, 10).filter(r => r?.type === 'csp-violation').map(r => r.body) : [raw?.['csp-report']];
    for (const report of reports) {
      const directive = report?.['effective-directive'] ?? report?.effectiveDirective;
      if (!DIRECTIVES.has(directive)) continue;
      const blocked = report?.['blocked-uri'] ?? report?.blockedURL;
      let blockedOrigin = 'unknown';
      if (['inline', 'eval', 'self', 'data', 'blob'].includes(blocked)) blockedOrigin = blocked;
      else if (typeof blocked === 'string' && blocked.length < 2048) {
        try {
          const url = new URL(blocked);
          if (['https:', 'http:'].includes(url.protocol)) blockedOrigin = url.origin;
        } catch { /* malformed reports are ignored */ }
      }
      const now = Date.now();
      if (now - windowStart >= 60000) { windowStart = now; reportsLogged = 0; }
      // Per-instance log budget only; this is not a distributed rate limiter.
      if (reportsLogged++ < 20) console.warn('csp_violation', { directive, blockedOrigin });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response(null, { status: error instanceof RangeError ? 413 : 400 });
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
