import { afterEach, expect, it, vi } from 'vitest';
import { serializeJsonLd } from './serializeJsonLd';
import { POST } from '../app/api/csp-report/route';
import { buildContentSecurityPolicy } from '../../security-policy.mjs';
import storesData from '../../../../data/stores.json';

afterEach(() => vi.restoreAllMocks());
it('preserves JSON while preventing closing-tag injection', () => {
  const payload = { title: '</ScRiPt><script>alert(1)</script>', name: '<&>\u2028' };
  const serialized = serializeJsonLd(payload);
  expect(serialized).not.toContain('<');
  expect(JSON.parse(serialized)).toEqual(payload);
});
it('enforces production origins without eval, allowing development HMR', () => {
  const prod = buildContentSecurityPolicy({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com/Prod', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'auth.example.com' });
  expect(prod).not.toContain("'unsafe-eval'");
  expect(prod).toContain("object-src 'none'");
  expect(prod).toContain('https://api.example.com');
  expect(prod).not.toContain('/Prod');
  expect(prod).toContain('https://auth.example.com');
  expect(prod).toContain('report-uri /api/csp-report');
  expect(buildContentSecurityPolicy({ NODE_ENV: 'development' })).toContain("'unsafe-eval'");
});
it('allows every affiliate banner host in img-src', () => {
  const imgSrc = buildContentSecurityPolicy({ NODE_ENV: 'production' }).split('; ').find((d) => d.startsWith('img-src '))!.split(' ').slice(1);
  const allowed = (host: string) => imgSrc.some((src) => src === `https://${host}` || (src.startsWith('https://*.') && host.endsWith(src.slice('https://*'.length))));
  const hosts = new Set(storesData.stores.flatMap((s: { affiliate?: { banner?: { image: string } } }) => (s.affiliate?.banner ? [new URL(s.affiliate.banner.image).host] : [])));
  expect(hosts.size).toBeGreaterThan(0);
  expect([...hosts].filter((h) => !allowed(h))).toEqual([]);
});
it('accepts browser reports without logging URLs, credentials or script samples', async () => {
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const response = await POST(new Request('https://site.test/api/csp-report', {
    method: 'POST', headers: { 'Content-Type': 'application/csp-report' },
    body: JSON.stringify({ 'csp-report': { 'effective-directive': 'script-src-elem', 'blocked-uri': 'https://user:pass@bad.test/path?secret=token', 'document-uri': 'https://site.test/account?email=x', 'script-sample': 'private data' } }),
  }));
  expect(response.status).toBe(204);
  expect(log).toHaveBeenCalledWith('csp_violation', { directive: 'script-src-elem', blockedOrigin: 'https://bad.test' });
});
it('rejects oversized streamed reports without trusting Content-Length', async () => {
  const response = await POST(new Request('https://site.test/api/csp-report', { method: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: 'a'.repeat(17000) }));
  expect(response.status).toBe(413);
});
it('rejects unsupported types and malformed reports', async () => {
  expect((await POST(new Request('https://site.test/api/csp-report', { method: 'POST', body: '{}' }))).status).toBe(415);
  expect((await POST(new Request('https://site.test/api/csp-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))).status).toBe(400);
});
