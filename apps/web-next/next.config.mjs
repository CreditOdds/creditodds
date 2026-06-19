import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

// Content-Security-Policy, shipped in REPORT-ONLY mode (see headers() below).
// Report-only collects violations in the browser console without breaking the
// page, so we can tune it against real traffic before enforcing. Before flipping
// the header name to 'Content-Security-Policy', replace 'unsafe-inline' /
// 'unsafe-eval' with per-request nonces and prune anything unused.
// Third parties inventoried: LogRocket (cdn.lr-*), Firebase Auth (apis.google.com,
// gstatic, *.googleapis.com, creditodds.firebaseapp.com, accounts.google.com),
// Google Fonts, Highcharts (bundled — no external origin), the card-image CDN/S3,
// Google profile photos, and the API origin.
const DEFAULT_API_ORIGIN = 'https://d2ojrhbh2dincr.cloudfront.net';
// Normalize to a bare origin — a CSP host-source must not carry a path (the env
// var may include one, e.g. an API Gateway ".../Prod" URL in some environments).
let API_ORIGIN;
try {
  API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_ORIGIN).origin;
} catch {
  API_ORIGIN = DEFAULT_API_ORIGIN;
}

const contentSecurityPolicy = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://cdn.lr-ingest.io https://cdn.lr-in.com https://cdn.lr-in-prod.com https://cdn.logrocket.io https://cdn.lr-hv-ingest.io`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  `img-src 'self' data: blob: https://d3ay3etzd1512y.cloudfront.net https://credit-card-data-site.s3.us-east-2.amazonaws.com https://*.googleusercontent.com`,
  `connect-src 'self' ${API_ORIGIN} https://*.googleapis.com https://*.lr-ingest.io https://*.logrocket.io https://*.lr-in.com https://*.lr-in-prod.com https://*.lr-hv-ingest.io https://fonts.gstatic.com`,
  `frame-src 'self' https://creditodds.firebaseapp.com https://accounts.google.com https://apis.google.com`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Rewrite /_admin to /admin (underscore folders are private in App Router)
  async rewrites() {
    return [
      {
        source: '/_admin',
        destination: '/admin',
      },
    ];
  },

  // The Wyndham Earner Premier launch coverage was first published under
  // /articles, then moved to /news. Redirect the old URL so shared links and the
  // auto-posted social link keep resolving instead of 404ing.
  async redirects() {
    return [
      {
        source: '/articles/wyndham-rewards-earner-premier',
        destination: '/news/wyndham-rewards-earner-premier',
        permanent: true,
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'd3ay3etzd1512y.cloudfront.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'credit-card-data-site.s3.us-east-2.amazonaws.com',
        pathname: '/**',
      },
    ],
    // Optimize image formats
    formats: ['image/avif', 'image/webp'],
  },

  // Enable compression
  compress: true,

  // Powered by header removal for security
  poweredByHeader: false,

  // Security and caching headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            // Force HTTPS for two years. Site is HTTPS-only, so this is safe now.
            // `preload` is intentionally omitted — it's a hard-to-reverse commitment
            // (submit to hstspreload.org separately once confident).
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
          {
            // Report-only: logs violations, breaks nothing. Tune, then enforce by
            // renaming this key to 'Content-Security-Policy'. (X-XSS-Protection was
            // removed here — deprecated and superseded by CSP.)
            key: 'Content-Security-Policy-Report-Only',
            value: contentSecurityPolicy,
          },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), microphone=(), camera=()',
          },
        ],
      },
      {
        // Cache static assets
        source: '/assets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
