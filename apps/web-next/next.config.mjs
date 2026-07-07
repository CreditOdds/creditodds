import { withSentryConfig } from '@sentry/nextjs';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

// Content-Security-Policy, shipped in REPORT-ONLY mode (see headers() below).
// Report-only collects violations in the browser console without breaking the
// page, so we can tune it against real traffic before enforcing. Before flipping
// the header name to 'Content-Security-Policy', replace 'unsafe-inline' /
// 'unsafe-eval' with per-request nonces and prune anything unused.
// Third parties inventoried: PostHog (us.i.posthog.com / us-assets.i.posthog.com),
// Firebase Auth (apis.google.com,
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
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://us-assets.i.posthog.com`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  `img-src 'self' data: blob: https://d3ay3etzd1512y.cloudfront.net https://credit-card-data-site.s3.us-east-2.amazonaws.com https://*.googleusercontent.com`,
  `connect-src 'self' ${API_ORIGIN} https://*.googleapis.com https://us.i.posthog.com https://us-assets.i.posthog.com https://fonts.gstatic.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io`,
  `frame-src 'self' https://creditodds.firebaseapp.com https://accounts.google.com https://apis.google.com`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Turbopack (the default builder in Next 16) generates ~37 MB of server
    // source maps by default. They ship in the .next output and pushed the
    // Amplify deploy artifact past its 220 MB limit. The Amplify build has no
    // SENTRY_AUTH_TOKEN, so these maps are never uploaded — pure dead weight.
    // Disable them. (To get readable server stack traces in Sentry later,
    // re-enable + upload + delete them in a dedicated CI step rather than
    // shipping the .map files in the deploy artifact.)
    turbopackSourceMaps: false,
  },

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

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  // Sentry org/project for source-map upload (build-time only).
  org: 'creditodds',
  project: 'javascript-nextjs',

  // Source maps are uploaded only when SENTRY_AUTH_TOKEN is present (set it as a
  // secret in CI). Without it, the build still succeeds — just without readable
  // stack traces in Sentry.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only print upload logs in CI.
  silent: !process.env.CI,

  // Upload a wider set of source maps for clearer stack traces.
  widenClientFileUpload: true,

  // Route Sentry browser requests through this same-origin path to dodge
  // ad-blockers (and keep CSP connect-src simple). Next.js proxies it to Sentry.
  tunnelRoute: '/monitoring',
});
