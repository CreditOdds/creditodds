import { withSentryConfig } from '@sentry/nextjs/config';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });
export default withSentryConfig(withBundleAnalyzer({
  output: 'export',
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  experimental: { turbopackSourceMaps: false, cpus: 4 },
  images: {
    loader: 'custom',
    loaderFile: './src/lib/staticImageLoader.ts',
    deviceSizes: [640, 1200],
    imageSizes: [32, 96, 256],
  },
}), {
  org: 'creditodds', project: 'javascript-nextjs',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Browser reporting goes directly to Sentry; a tunnel requires a Next server.
});
