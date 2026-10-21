jest.mock('../src/db', () => ({ query: jest.fn(), end: jest.fn() }));
jest.mock('../src/lib/cards-cdn', () => ({ fetchCardsFromCDN: jest.fn() }));
const mysql = require('../src/db');
const { fetchCardsFromCDN } = require('../src/lib/cards-cdn');
const { CheckOddsHandler } = require('../src/handlers/check-odds');
const stats = (overrides = {}) => ({
  card_id: 1, approved_count: 10, total_records: 12,
  approved_median_credit_score: 700, approved_median_income: 50000, approved_median_length_credit: 3,
  approved_credit_score_count: 10, approved_income_count: 5, approved_length_credit_count: 6,
  updated_at: '2026-10-21T00:00:00Z', latest_approved_application: '2026-10-01', ...overrides,
});
let rows;
const request = (body = { credit_score: 700, income: 50000, length_credit: 3 }) => ({
  httpMethod: 'POST', requestContext: { authorizer: { sub: 'user-1' } }, body: JSON.stringify(body),
});
beforeEach(() => {
  jest.clearAllMocks();
  rows = [stats()];
  mysql.end.mockResolvedValue();
  mysql.query.mockImplementation(async sql => {
    if (sql.includes('FROM card_stats')) return rows;
    if (sql.includes('FROM cards')) return rows.map(row => ({ card_id: row.card_id, card_name: `Card ${row.card_id}`, accepting_applications: 1 }));
    return {};
  });
  fetchCardsFromCDN.mockImplementation(async () => rows.map(row => ({ card_id: row.card_id, card_name: `Card ${row.card_id}`, slug: `card-${row.card_id}` })));
});
async function results(body) {
  const result = await CheckOddsHandler(request(body));
  expect(result.statusCode).toBe(200);
  expect(result.headers['Cache-Control']).toBe('no-store');
  return JSON.parse(result.body).cards;
}
test('compares all three populated fields, including equality', async () => {
  const [card] = await results();
  expect(card).toMatchObject({ match_score: 3, available_metrics: 3, income_sample_count: 5, above_income: true, stats_updated_at: '2026-10-21T00:00:00Z', latest_approved_application: '2026-10-01' });
});
test('null medians cannot become free matches', async () => {
  rows = [stats({ approved_median_income: null, approved_median_length_credit: null })];
  const [card] = await results({ credit_score: 700, income: 0, length_credit: 0 });
  expect(card).toMatchObject({ match_score: 1, available_metrics: 1, has_enough_data: false, median_income: null, above_income: null, above_length_credit: null });
});
test('requires five observations per field, not five total approvals', async () => {
  rows = [stats({ approved_income_count: 4, approved_length_credit_count: 0 })];
  expect((await results())[0]).toMatchObject({ available_metrics: 1, match_score: 1, median_income: null, income_sample_count: 4 });
});
test.each([null, undefined, NaN, Infinity, '50000', -1])('rejects unusable income statistic %p', async median => {
  rows = [stats({ approved_median_income: median })];
  expect((await results())[0]).toMatchObject({ available_metrics: 2, above_income: null });
});
test('zero income and history are valid observations', async () => {
  rows = [stats({ approved_median_income: 0, approved_median_length_credit: 0 })];
  expect((await results({ credit_score: 700, income: 0, length_credit: 0 }))[0]).toMatchObject({ available_metrics: 3, match_score: 3, median_income: 0, median_length_credit: 0 });
});
test('pre-migration or not-yet-refreshed counts produce insufficient data', async () => {
  rows = [stats({ approved_credit_score_count: undefined, approved_income_count: null, approved_length_credit_count: undefined })];
  expect((await results())[0]).toMatchObject({ available_metrics: 0, match_score: 0, has_enough_data: false, above_credit_score: null });
});
test('sorts complete comparisons ahead of partial and unavailable comparisons', async () => {
  rows = [stats({ card_id: 1, approved_income_count: 0 }), stats({ card_id: 2 }), stats({ card_id: 3, approved_credit_score_count: 0, approved_income_count: 0, approved_length_credit_count: 0 })];
  expect((await results()).map(card => card.card_id)).toEqual([2, 1, 3]);
});
test.each([null, [], { credit_score: 299, income: 0, length_credit: 0 }, { credit_score: 700, income: -1, length_credit: 0 }])('invalid input returns 400 without querying', async body => {
  expect((await CheckOddsHandler(request(body))).statusCode).toBe(400);
  expect(mysql.query).not.toHaveBeenCalled();
});
test('rejects invalid JSON and nonfinite numeric JSON', async () => {
  for (const body of ['{', '{"credit_score":700,"income":1e999,"length_credit":0}']) {
    expect((await CheckOddsHandler({ ...request(), body })).statusCode).toBe(400);
  }
});
