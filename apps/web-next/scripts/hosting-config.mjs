import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import { buildContentSecurityPolicy } from '../security-policy.mjs';
const api = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://d2ojrhbh2dincr.cloudfront.net';
const rules = [
  { source: '/articles/wyndham-rewards-earner-premier', target: '/news/wyndham-rewards-earner-premier', status: '301' },
  { source: '/best-card-for/budget-car-rental', target: '/best-card-for/budget', status: '301' },
  { source: '/news/trump-credit-card-interest-rate-cap-proposal', target: '/news', status: '301' },
  { source: '/_admin', target: '/admin', status: '301' },
  // Compatibility for existing clients during rollout. New clients call the backend directly.
  { source: '/api/best-card-for-me', target: `${api}/best-card-for-me`, status: '200' },
  { source: '/api/csp-report', target: `${api}/csp-report`, status: '200' },
  { source: '/<*>', target: '/404.html', status: '404' },
];
await fs.mkdir('hosting', { recursive: true });
await fs.writeFile('hosting/custom-rules.json', JSON.stringify(rules, null, 2) + '\n');
const headers = {
  'X-DNS-Prefetch-Control': 'on',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Content-Security-Policy': buildContentSecurityPolicy({ ...process.env, NODE_ENV: 'production' }),
  'Permissions-Policy': 'geolocation=(self), microphone=(), camera=()',
};
await fs.writeFile('../../customHttp.yml', yaml.dump({ applications: [{ appRoot: 'apps/web-next', customHeaders: [
  { pattern: '**', headers: Object.entries(headers).map(([key,value]) => ({ key,value })) },
  ...['**/opengraph-image', '**/twitter-image', '/api/og/compare'].map(pattern => ({ pattern, headers: [{ key: 'Content-Type', value: 'image/png' }] })),
  ...['/api/news', '/api/articles', '/api/best'].map(pattern => ({ pattern, headers: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }] })),
  ...['/_images/**', '/_next/static/**'].map(pattern => ({ pattern, headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] })),
] }] }));

// Amplify reads the build specification from the repository root.
await fs.copyFile('amplify.yml', '../../amplify.yml');
