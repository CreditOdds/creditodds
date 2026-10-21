import posthog from 'posthog-js';

// Web Vitals reporting utility
// Captures Core Web Vitals metrics for performance monitoring

type MetricName = 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB';

interface Metric {
  name: MetricName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
}

type ReportHandler = (metric: Metric) => void;

// Send metrics to analytics endpoint
function sendToAnalytics(metric: Metric) {
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Web Vitals] ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})`);
  }

  if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
    // Existing analytics transport; route groups avoid card IDs, searches and
    // query strings. Numeric values keep p75 queries possible by device/route.
    posthog.capture('web_vital', {
      metric: metric.name,
      value: metric.value,
      rating: metric.rating,
      route: initialRoute,
      device_class: window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop',
      $current_url: `${window.location.origin}${initialRoute}`,
      $pathname: initialRoute,
      $referrer: '',
    });
  }
}

let initialized = false;
let initialRoute = '/';
export function vitalsRoute(pathname: string): string {
  const prefix = pathname.split('/').filter(Boolean)[0];
  if (!prefix) return '/';
  if (['card', 'news', 'articles', 'best', 'best-card-for', 'compare', 'bank'].includes(prefix)) return `/${prefix}/:page`;
  return ['explore', 'wallet', 'tools', 'login', 'signup'].includes(prefix) ? `/${prefix}` : '/other';
}

export function reportWebVitals(onPerfEntry?: ReportHandler) {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;
  initialRoute = vitalsRoute(window.location.pathname);

  const handler = onPerfEntry || sendToAnalytics;

  // web-vitals v4+ removed onFID (replaced by onINP)
  import('web-vitals').then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
    onCLS(handler);
    onFCP(handler);
    onINP(handler);
    onLCP(handler);
    onTTFB(handler);
  }).catch(() => {
    // web-vitals not available
  });
}

// Get rating thresholds for each metric
export const thresholds = {
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  INP: { good: 200, poor: 500 },
  LCP: { good: 2500, poor: 4000 },
  TTFB: { good: 800, poor: 1800 },
};
