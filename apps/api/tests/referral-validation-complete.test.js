jest.mock("../src/db", () => ({
  query: jest.fn(),
  end: jest.fn(),
}));
jest.mock("../src/lib/audit-log", () => ({ logAuditAction: jest.fn() }));
jest.mock("../src/lib/referral-expiry-email", () => ({
  isEnabled: jest.fn(() => true),
  sendExpiryNotification: jest.fn(async () => ({ sent: true, cardNames: ["Card"] })),
}));

const mysql = require("../src/db");
const { logAuditAction } = require("../src/lib/audit-log");
const expiryEmail = require("../src/lib/referral-expiry-email");
const { ReferralValidationCompleteHandler } = require("../src/handlers/referral-validation-complete");

// Every referral row starts with `failures` prior strikes. UPDATEs return {}.
function mockRows(failures) {
  mysql.query.mockImplementation(async (sql) => {
    if (/^\s*SELECT/.test(sql)) {
      return [{ validation_consecutive_failures: failures, archived_at: null, submitter_id: "uid-1" }];
    }
    return {};
  });
}

const updates = () => mysql.query.mock.calls.filter(([sql]) => /UPDATE referrals/.test(sql));
const auditActions = () => logAuditAction.mock.calls.map((c) => c[1]);

describe("ReferralValidationComplete", () => {
  beforeEach(() => {
    mysql.query.mockReset();
    mysql.end.mockReset().mockResolvedValue(undefined);
    logAuditAction.mockReset();
    expiryEmail.sendExpiryNotification.mockClear();
  });

  test("unreachable on a link with a prior strike does not archive or email", async () => {
    mockRows(1);
    const out = await ReferralValidationCompleteHandler({
      results: [{ referral_id: 65, status: "unreachable", reason: "timeout" }],
    });

    expect(out.archived).toEqual([]);
    expect(out.emailed).toBe(0);
    expect(expiryEmail.sendExpiryNotification).not.toHaveBeenCalled();
    const [[sql, params]] = updates();
    expect(sql).toMatch(/validation_status = 'unreachable'/);
    expect(sql).not.toMatch(/validation_consecutive_failures/);
    expect(sql).not.toMatch(/archived_at/);
    expect(params).toEqual([65]);
    expect(auditActions()).toEqual(["VALIDATION_UNREACHABLE"]);
  });

  test("a second expired result still archives and emails", async () => {
    mockRows(1);
    const out = await ReferralValidationCompleteHandler({
      results: [{ referral_id: 53, status: "expired", reason: "HTTP 404" }],
    });

    expect(out.archived).toEqual([53]);
    expect(out.emailed).toBe(1);
    expect(auditActions()).toEqual(["AUTO_ARCHIVE", "EXPIRY_EMAIL"]);
  });

  test("a mostly-unreachable batch skips the unreachable rows untouched", async () => {
    mockRows(0);
    const out = await ReferralValidationCompleteHandler({
      results: [
        { referral_id: 1, status: "unreachable" },
        { referral_id: 2, status: "unreachable" },
        { referral_id: 3, status: "unreachable" },
        { referral_id: 4, status: "valid" },
        { referral_id: 5, status: "expired", reason: "HTTP 404" },
      ],
    });

    expect(out.skipped.map((s) => s.referral_id)).toEqual([1, 2, 3]);
    expect(out.processed).toBe(2);
    expect(updates().map(([, params]) => params[params.length - 1])).toEqual([4, 5]);
    expect(auditActions()).toEqual(["VALIDATION_FAIL"]);
  });

  test("a few unreachable results in a healthy batch are recorded", async () => {
    mockRows(0);
    const out = await ReferralValidationCompleteHandler({
      results: [
        { referral_id: 1, status: "unreachable" },
        { referral_id: 2, status: "unreachable" },
        { referral_id: 3, status: "unreachable" },
        { referral_id: 4, status: "valid" },
        { referral_id: 5, status: "valid" },
        { referral_id: 6, status: "valid" },
        { referral_id: 7, status: "valid" },
      ],
    });

    expect(out.skipped).toEqual([]);
    expect(out.processed).toBe(7);
    expect(auditActions()).toEqual(Array(3).fill("VALIDATION_UNREACHABLE"));
  });
});
