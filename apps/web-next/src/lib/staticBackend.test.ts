import { beforeEach, expect, it, vi } from 'vitest';
import { BestCardForMeHandler } from '../../../api/src/handlers/best-card-for-me-core';
import { CspReportHandler } from '../../../api/src/handlers/csp-report-core';
import { getAllCards } from '../../../api/src/lib/public-card-catalog';
vi.mock('../../../api/src/lib/public-card-catalog', () => ({ getAllCards: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it('serves CORS preflight and rejects malformed or oversized recommendations before reading cards', async () => {
  for (const [event, status] of [
    [{ httpMethod: 'OPTIONS' }, 204],
    [{ httpMethod: 'GET' }, 405],
    [{ httpMethod: 'POST', body: '{' }, 400],
    [{ httpMethod: 'POST', body: 'null' }, 400],
    [{ httpMethod: 'POST', body: '{"spend":{}}' }, 400],
    [{ httpMethod: 'POST', body: 'x'.repeat(17000) }, 413],
  ] as const) {
    const result = await BestCardForMeHandler(event);
    expect(result.statusCode).toBe(status);
    expect(result.headers['Cache-Control']).toBe('no-store');
  }
  expect(getAllCards).not.toHaveBeenCalled();
});
it('preserves anonymous personalized rankings and only loads the catalog once', async () => {
  vi.mocked(getAllCards).mockResolvedValue([
    { slug: 'flat', card_name: 'Flat', bank: 'Test', annual_fee: 0, reward_type: 'cashback', rewards: [{ category: 'everything_else', value: 2, unit: 'percent' }] },
  ] as Awaited<ReturnType<typeof getAllCards>>);
  const result = await BestCardForMeHandler({ httpMethod: 'POST', body: JSON.stringify({ spend: { groceries: 12000 }, walletSlugs: [] }) });
  expect(result.statusCode).toBe(200);
  const data = JSON.parse(result.body);
  expect(data.recommendations[0].card.slug).toBe('flat');
  expect(data.recommendations[0].netAnnualValue).toBe(240);
  expect(data.walletAnalysis).toBeInstanceOf(Array);
  expect(getAllCards).toHaveBeenCalledOnce();
});
it('accepts base64 API Gateway CSP reports and rejects oversized reports', async () => {
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const body = JSON.stringify({ 'csp-report': { 'effective-directive': 'img-src', 'blocked-uri': 'https://blocked.test/private?token=secret' } });
  const response = await CspReportHandler({ httpMethod: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: Buffer.from(body).toString('base64'), isBase64Encoded: true });
  expect(response.statusCode).toBe(204);
  expect(log).toHaveBeenCalledWith('csp_violation', { directive: 'img-src', blockedOrigin: 'https://blocked.test' });
  log.mockRestore();
  expect((await CspReportHandler({ httpMethod: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: 'x'.repeat(17000) })).statusCode).toBe(413);
});
