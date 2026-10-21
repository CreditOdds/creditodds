jest.mock('../src/db', () => ({ query: jest.fn(), end: jest.fn() }));
const mysql = require('../src/db');
const { RefreshCardStatsHandler } = require('../src/handlers/refresh-card-stats');
beforeEach(() => { jest.clearAllMocks(); mysql.end.mockResolvedValue(); });
test('populates sample counts when the migration is present', async () => {
  mysql.query.mockResolvedValue({ affectedRows: 3 });
  expect(await RefreshCardStatsHandler({})).toMatchObject({ ok: true, affectedRows: 3, sampleCountsAvailable: true });
  expect(mysql.query).toHaveBeenCalledTimes(1);
  expect(mysql.query.mock.calls[0][0]).toContain('approved_income_count = VALUES(approved_income_count)');
});
test('keeps legacy statistics refreshing before migration and adopts counts after migration', async () => {
  mysql.query.mockRejectedValueOnce(Object.assign(new Error("Unknown column 'approved_income_count' in 'field list'"), { code: 'ER_BAD_FIELD_ERROR' }))
    .mockResolvedValue({ affectedRows: 3 });
  expect(await RefreshCardStatsHandler({})).toMatchObject({ ok: true, sampleCountsAvailable: false });
  const fallback = mysql.query.mock.calls[1][0];
  expect(fallback).not.toContain('approved_income_count');
  expect(fallback).toContain('approved_median_income = VALUES(approved_median_income)');
  expect(await RefreshCardStatsHandler({})).toMatchObject({ ok: true, sampleCountsAvailable: true });
  expect(mysql.query.mock.calls[2][0]).toContain('approved_income_count');
});
test.each([
  { code: 'ETIMEDOUT', message: 'timeout' },
  { code: 'ER_BAD_FIELD_ERROR', message: "Unknown column 'broken_column'" },
])('does not hide unrelated database errors: %j', async details => {
  const error = Object.assign(new Error(details.message), details);
  mysql.query.mockRejectedValue(error);
  await expect(RefreshCardStatsHandler({})).rejects.toBe(error);
  expect(mysql.query).toHaveBeenCalledTimes(1);
  expect(mysql.end).toHaveBeenCalledTimes(1);
});
