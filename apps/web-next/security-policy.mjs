// Static pages require inline Next bootstrap scripts. Keep unsafe-inline until
// build-time hashes are available; nonces would force request-time rendering.
// Production blocks eval and unlisted script origins, objects, framing and forms.
function origin(value, fallback) {
  try {
    const parsed = new URL(value);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.origin : fallback;
  } catch { return fallback; }
}

export function buildContentSecurityPolicy(env = process.env) {
  const api = origin(env.NEXT_PUBLIC_API_BASE_URL, 'https://d2ojrhbh2dincr.cloudfront.net');
  const auth = origin(`https://${env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'creditodds.firebaseapp.com'}`, 'https://creditodds.firebaseapp.com');
  const dev = env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''} https://apis.google.com https://www.gstatic.com https://relay.creditodds.com https://www.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    // Affiliate banners on /best-card-for/[slug] load from the networks' ad
    // CDNs. Hosts mirror data/affiliates.yaml; re-check after a bulk banner
    // refresh, since an unlisted host is blocked and the CTA falls back to text.
    "img-src 'self' data: blob: https://d3ay3etzd1512y.cloudfront.net https://credit-card-data-site.s3.us-east-2.amazonaws.com https://*.googleusercontent.com https://*.google-analytics.com https://www.googletagmanager.com https://a.impactradius-go.com https://console.partnerize.com https://*.pntra.com https://*.pntrs.com https://*.pjtra.com https://*.pjatr.com https://*.gopjn.com https://*.pntrac.com https://media.pepperjamnetwork.com https://content.flexlinks.com https://hst.tradedoubler.com https://*.awin1.com https://www.opmpros.com https://fcbchicago.egnyte.com",
    `connect-src 'self' ${api} ${auth} https://*.googleapis.com https://relay.creditodds.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.google-analytics.com https://www.googletagmanager.com${dev ? ' ws: wss:' : ''}`,
    `frame-src 'self' ${auth} https://accounts.google.com https://apis.google.com`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    // report-uri remains supported by more browsers than Reporting-Endpoints.
    'report-uri /api/csp-report',
  ].join('; ');
}
