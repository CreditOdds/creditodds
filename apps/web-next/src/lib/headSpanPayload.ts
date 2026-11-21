// Strips the response size Sentry records on HEAD fetch spans, because a HEAD
// response has no body and the recorded size is fiction.
//
// Where the HEADs come from: next.config.mjs sets `output: 'export'`, and in
// export mode Next's <Link> prefetcher (segment-cache/cache.js,
// fetchRouteOnCacheMiss) can't ask for a segment with request headers. So
// before fetching a link's `__next.*.txt` segment files it sends
// `fetch(url, { method: 'HEAD' })` to the page itself, only to reject 4xx/5xx
// and follow redirects. Every prefetched navbar/footer/in-article link costs
// one HEAD. (Next's offline detector, client/components/offline.js, sends a
// HEAD to the current page too.)
//
// Why Sentry flags them: @sentry/core's fetch instrumentation (fetch.js,
// endSpan) copies the response's Content-Length header onto the span as
// `http.response_content_length` without checking the method. For a HEAD,
// CloudFront answers with the Content-Length of the full, uncompressed HTML
// document: 409,413 bytes for /best-card-for when checked on 2026-11-21, while
// a real browser GET of that page downloads 41,525 bytes brotli-compressed.
// Sentry's "Large HTTP payload" performance detector reads that attribute, so
// every prefetch of a big page opened an issue (CREDITODDS-JAVASCRIPT-NEXTJS-24
// through -29 and -2C: HEAD /best-card-for, /news, /explore, /compare, ...)
// even though zero body bytes crossed the network.
//
// The attribute is removed only for HEAD requests, so a GET that really
// downloads a large body still keeps its size and can still be flagged. The
// span itself is kept: its timing is real and still useful.

const HEAD_PREFIX = 'HEAD ';

interface SpanLike {
  op?: unknown;
  description?: unknown;
  data?: Record<string, unknown> | null;
}

function isHeadFetchSpan(span: SpanLike): boolean {
  if (span.op !== 'http.client') return false;
  const method = span.data?.['http.method'];
  if (typeof method === 'string') return method.toUpperCase() === 'HEAD';
  // Fall back to the description ("HEAD https://...") if the method
  // attribute is ever renamed.
  return (
    typeof span.description === 'string' &&
    span.description.startsWith(HEAD_PREFIX)
  );
}

export function stripHeadResponseSize<T extends SpanLike>(span: T): T {
  if (
    span.data &&
    'http.response_content_length' in span.data &&
    isHeadFetchSpan(span)
  ) {
    delete span.data['http.response_content_length'];
  }
  return span;
}
