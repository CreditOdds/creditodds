jest.mock("../src/db", () => ({
  query: jest.fn(),
  end: jest.fn(),
}));

const mysql = require("../src/db");
const { UserWalletHandler } = require("../src/handlers/user-wallet");

function event(method, path, id, body) {
  return {
    httpMethod: method,
    path,
    resource: path,
    pathParameters: { id: String(id) },
    requestContext: { authorizer: { principalId: "user-123" } },
    body: body ? JSON.stringify(body) : undefined,
  };
}

describe("wallet referral cleanup", () => {
  beforeEach(() => {
    mysql.query.mockReset();
    mysql.end.mockReset().mockResolvedValue(undefined);
  });

  test("archives the card referral when a wallet card is closed", async () => {
    mysql.query
      .mockResolvedValueOnce([{ id: 7, card_id: 42, closed_date: null }])
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce({ insertId: 91 });

    const response = await UserWalletHandler(
      event("POST", "/wallet/7/close", 7, { close_date: "2026-07-14" })
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).referrals_archived).toBe(1);
    expect(mysql.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("UPDATE referrals"),
      ["wallet: card closed", "user-123", 42]
    );
  });

  test("archives the card referral when a wallet card is removed", async () => {
    mysql.query
      .mockResolvedValueOnce([{ card_id: 42 }])
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce({ affectedRows: 1 });

    const response = await UserWalletHandler(
      event("DELETE", "/wallet/7", 7)
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).referrals_archived).toBe(1);
    expect(mysql.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("UPDATE referrals"),
      ["wallet: card removed", "user-123", 42]
    );
  });

  test("does not archive a referral when the wallet row is not owned by the user", async () => {
    mysql.query.mockResolvedValueOnce([]);

    const response = await UserWalletHandler(
      event("DELETE", "/wallet/7", 7)
    );

    expect(response.statusCode).toBe(404);
    expect(mysql.query).toHaveBeenCalledTimes(1);
  });
});
