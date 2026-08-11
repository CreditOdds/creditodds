// Unit tests for getClientIp / hashIp (src/click-identity.js). Written with
// the x-origin-verify hardening: the raw execute-api origin is publicly
// reachable, so a direct caller controls the second-to-last X-Forwarded-For
// entry — the slot the legacy logic trusted as "the real client". When
// ORIGIN_VERIFY_SECRET is set, XFF is only trusted on requests carrying the
// matching header (attached by CloudFront as a custom origin header);
// everything else must fall back to the unforgeable TCP peer address.

const crypto = require("crypto");
const { getClientIp, hashIp } = require("../src/click-identity");

const SECRET = "0123456789abcdef0123456789abcdef";
const SOURCE_IP = "203.0.113.50";

function makeEvent({ xff, originVerify, sourceIp = SOURCE_IP } = {}) {
  const headers = {};
  if (xff !== undefined) headers["X-Forwarded-For"] = xff;
  if (originVerify !== undefined) headers["x-origin-verify"] = originVerify;
  return { headers, requestContext: { identity: { sourceIp } } };
}

const ENV_KEYS = ["ORIGIN_VERIFY_SECRET", "IP_HASH_PEPPER"];
const savedEnv = {};

beforeAll(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
});

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  console.warn.mockRestore();
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("getClientIp — legacy mode (no ORIGIN_VERIFY_SECRET)", () => {
  test("trusts the second-to-last XFF entry (CloudFront-shaped chain)", () => {
    const event = makeEvent({ xff: "198.51.100.7, 130.176.0.10" });
    expect(getClientIp(event)).toBe("198.51.100.7");
  });

  test("single-entry XFF chain returns that entry", () => {
    const event = makeEvent({ xff: "198.51.100.7" });
    expect(getClientIp(event)).toBe("198.51.100.7");
  });

  test("no XFF header falls back to sourceIp", () => {
    expect(getClientIp(makeEvent())).toBe(SOURCE_IP);
  });

  test("missing requestContext yields null without throwing", () => {
    expect(getClientIp({ headers: {} })).toBeNull();
  });
});

describe("getClientIp — enforcing mode (ORIGIN_VERIFY_SECRET set)", () => {
  beforeEach(() => {
    process.env.ORIGIN_VERIFY_SECRET = SECRET;
  });

  test("matching x-origin-verify header keeps the XFF-derived client IP", () => {
    const event = makeEvent({
      xff: "198.51.100.7, 130.176.0.10",
      originVerify: SECRET,
    });
    expect(getClientIp(event)).toBe("198.51.100.7");
  });

  test("header name is accepted case-insensitively", () => {
    const event = {
      headers: {
        "X-Forwarded-For": "198.51.100.7, 130.176.0.10",
        "X-Origin-Verify": SECRET,
      },
      requestContext: { identity: { sourceIp: SOURCE_IP } },
    };
    expect(getClientIp(event)).toBe("198.51.100.7");
  });

  test("missing header ignores a forged XFF and returns the TCP peer", () => {
    const event = makeEvent({ xff: "9.9.9.9, 10.0.0.1" });
    expect(getClientIp(event)).toBe(SOURCE_IP);
  });

  test("wrong header value ignores the XFF chain", () => {
    const event = makeEvent({
      xff: "9.9.9.9, 10.0.0.1",
      originVerify: "not-the-secret",
    });
    expect(getClientIp(event)).toBe(SOURCE_IP);
  });

  test("same-length wrong value still fails (timing-safe path)", () => {
    const wrong = SECRET.slice(0, -1) + (SECRET.endsWith("f") ? "0" : "f");
    const event = makeEvent({ xff: "9.9.9.9, 10.0.0.1", originVerify: wrong });
    expect(getClientIp(event)).toBe(SOURCE_IP);
  });
});

describe("hashIp", () => {
  test("returns null (with a warning) when the pepper is unset", () => {
    expect(hashIp("198.51.100.7")).toBeNull();
  });

  test("returns sha256(pepper + ip) when the pepper is set", () => {
    process.env.IP_HASH_PEPPER = "pepper";
    const expected = crypto
      .createHash("sha256")
      .update("pepper198.51.100.7")
      .digest("hex");
    expect(hashIp("198.51.100.7")).toBe(expected);
  });

  test("returns null for a null ip", () => {
    process.env.IP_HASH_PEPPER = "pepper";
    expect(hashIp(null)).toBeNull();
  });
});
