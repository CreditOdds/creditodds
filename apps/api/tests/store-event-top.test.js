jest.mock('../src/db', () => ({ query: jest.fn(), end: jest.fn() }));
const mysql = require('../src/db');
const { StoreEventHandler } = require('../src/handlers/store-event');

const topEvent = (qs) => ({
  httpMethod: 'GET',
  resource: '/store-event/top',
  path: '/store-event/top',
  queryStringParameters: qs || null,
  requestContext: {},
});

// The handler may first run its CREATE TABLE IF NOT EXISTS self-heal (only
// once per module load), so answer by SQL rather than call order. Rows mimic
// mysql's string SUM() results.
function mockRows(rows) {
  mysql.query.mockImplementation(async (sql) => (/^\s*CREATE TABLE/.test(sql) ? {} : rows));
}

beforeEach(() => { jest.clearAllMocks(); mysql.end.mockResolvedValue(); });

test('is public: answers without an admin claim and never hits the admin gate', async () => {
  mockRows([{ store_slug: 'temu', visits: '345', previous_visits: '300' }]);
  const res = await StoreEventHandler(topEvent());
  expect(res.statusCode).toBe(200);
  expect(JSON.parse(res.body).stores[0]).toEqual({
    rank: 1, slug: 'temu', name: 'Temu', visits: 345, previous_rank: 1,
  });
});

test('returns visits only, with no click or affiliate fields', async () => {
  mockRows([{ store_slug: 'temu', visits: '10', previous_visits: '0' }]);
  const body = JSON.parse((await StoreEventHandler(topEvent())).body);
  expect(Object.keys(body.stores[0]).sort()).toEqual(['name', 'previous_rank', 'rank', 'slug', 'visits']);
  expect(body).not.toHaveProperty('affiliateExperiment');
});

test('drops slugs that are not in the store catalog', async () => {
  mockRows([
    { store_slug: 'not-a-real-store-xyz', visits: '9999', previous_visits: '0' },
    { store_slug: 'temu', visits: '5', previous_visits: '0' },
  ]);
  const { stores } = JSON.parse((await StoreEventHandler(topEvent())).body);
  expect(stores.map((s) => s.slug)).toEqual(['temu']);
});

test('ranks by visits with a stable slug tie-break, and reports last week rank', async () => {
  mockRows([
    { store_slug: 'rei', visits: '17', previous_visits: '1' },
    { store_slug: 'neiman-marcus', visits: '17', previous_visits: '0' },
    { store_slug: 'temu', visits: '345', previous_visits: '50' },
    { store_slug: 'spotify', visits: '0', previous_visits: '20' },
  ]);
  const { stores } = JSON.parse((await StoreEventHandler(topEvent())).body);
  expect(stores.map((s) => [s.slug, s.rank, s.previous_rank])).toEqual([
    ['temu', 1, 1], // 50 beats spotify's 20 last week
    ['neiman-marcus', 2, null],
    ['rei', 3, 3],
  ]);
});

test('defaults to 7 and caps the limit', async () => {
  const slugs = require('../src/lib/ranker/stores.json').stores.slice(0, 40).map((s) => s.slug);
  const rows = slugs.map((slug, i) => ({ store_slug: slug, visits: String(100 - i), previous_visits: '0' }));
  mockRows(rows);
  expect(JSON.parse((await StoreEventHandler(topEvent())).body).stores).toHaveLength(7);
  mockRows(rows);
  expect(JSON.parse((await StoreEventHandler(topEvent({ limit: '500' }))).body).stores).toHaveLength(25);
});

test('the full stats GET is still admin-only', async () => {
  const res = await StoreEventHandler({ httpMethod: 'GET', resource: '/store-event', path: '/store-event', requestContext: {} });
  expect(res.statusCode).toBe(403);
  expect(mysql.query).not.toHaveBeenCalled();
});
