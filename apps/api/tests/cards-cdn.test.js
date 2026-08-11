// Unit tests for the shared CDN fetcher (src/lib/cards-cdn.js). Written when
// the copy-pasted per-handler fetchers were consolidated: warm Lambda
// containers hold a keep-alive socket that CloudFront closes after a few idle
// minutes, so the next invocation died instantly with ECONNRESET ("socket
// hang up") and the handler 500'd. The fetcher must retry transient socket
// errors exactly once on a fresh connection, time out stalled requests, and
// NOT retry non-transient failures (bad DNS, malformed JSON).

const { EventEmitter } = require("events");

jest.mock("https", () => ({ get: jest.fn() }));
const https = require("https");
const { fetchCardsFromCDN, _resetCacheForTests } = require("../src/lib/cards-cdn");

const CARDS = [{ card_name: "Test Card" }];
const BODY = JSON.stringify({ cards: CARDS });

function mockRequest() {
  const req = new EventEmitter();
  req.setTimeout = jest.fn();
  // Real ClientRequest.destroy(err) emits 'error' with err; replicate that.
  req.destroy = jest.fn((err) => {
    if (err) req.emit("error", err);
  });
  return req;
}

function respondWith(body) {
  return (url, cb) => {
    const req = mockRequest();
    process.nextTick(() => {
      const res = new EventEmitter();
      cb(res);
      res.emit("data", body);
      res.emit("end");
    });
    return req;
  };
}

function failWith(err) {
  return () => {
    const req = mockRequest();
    process.nextTick(() => req.emit("error", err));
    return req;
  };
}

function codedError(code, message) {
  const err = new Error(message || code);
  if (code) err.code = code;
  return err;
}

beforeEach(() => {
  https.get.mockReset();
  _resetCacheForTests();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  console.warn.mockRestore();
});

test("resolves cards on first-try success without retrying", async () => {
  https.get.mockImplementation(respondWith(BODY));

  await expect(fetchCardsFromCDN()).resolves.toEqual(CARDS);
  expect(https.get).toHaveBeenCalledTimes(1);
});

test("retries once after ECONNRESET and succeeds", async () => {
  https.get
    .mockImplementationOnce(failWith(codedError("ECONNRESET", "socket hang up")))
    .mockImplementationOnce(respondWith(BODY));

  await expect(fetchCardsFromCDN()).resolves.toEqual(CARDS);
  expect(https.get).toHaveBeenCalledTimes(2);
});

test("retries on a bare 'socket hang up' error with no code", async () => {
  https.get
    .mockImplementationOnce(failWith(new Error("socket hang up")))
    .mockImplementationOnce(respondWith(BODY));

  await expect(fetchCardsFromCDN()).resolves.toEqual(CARDS);
  expect(https.get).toHaveBeenCalledTimes(2);
});

test("retries only once: transient failure on both attempts rejects", async () => {
  https.get.mockImplementation(failWith(codedError("ECONNRESET", "socket hang up")));

  await expect(fetchCardsFromCDN()).rejects.toThrow("socket hang up");
  expect(https.get).toHaveBeenCalledTimes(2);
});

test("does not retry non-transient network errors", async () => {
  https.get.mockImplementation(failWith(codedError("ENOTFOUND", "getaddrinfo ENOTFOUND")));

  await expect(fetchCardsFromCDN()).rejects.toThrow("getaddrinfo ENOTFOUND");
  expect(https.get).toHaveBeenCalledTimes(1);
});

test("does not retry a JSON parse failure", async () => {
  https.get.mockImplementation(respondWith("<html>not json</html>"));

  await expect(fetchCardsFromCDN()).rejects.toThrow("Failed to parse cards.json");
  expect(https.get).toHaveBeenCalledTimes(1);
});

test("arms a request timeout and retries after it fires", async () => {
  let firstReq;
  https.get
    .mockImplementationOnce(() => {
      firstReq = mockRequest();
      // Simulate the idle timeout firing instead of a response arriving.
      process.nextTick(() => firstReq.setTimeout.mock.calls[0][1]());
      return firstReq;
    })
    .mockImplementationOnce(respondWith(BODY));

  await expect(fetchCardsFromCDN()).resolves.toEqual(CARDS);
  expect(https.get).toHaveBeenCalledTimes(2);
  expect(firstReq.setTimeout).toHaveBeenCalledWith(5000, expect.any(Function));
  expect(firstReq.destroy).toHaveBeenCalledWith(
    expect.objectContaining({ code: "ETIMEDOUT" })
  );
});

test("cacheBust appends a timestamp query param", async () => {
  https.get.mockImplementation(respondWith(BODY));

  await fetchCardsFromCDN({ cacheBust: true });
  expect(https.get.mock.calls[0][0]).toMatch(/cards\.json\?t=\d+$/);

  await fetchCardsFromCDN();
  expect(https.get.mock.calls[1][0]).toMatch(/cards\.json$/);
});

test("serves the module cache within the TTL without refetching", async () => {
  https.get.mockImplementation(respondWith(BODY));

  await expect(fetchCardsFromCDN()).resolves.toEqual(CARDS);
  await expect(fetchCardsFromCDN()).resolves.toEqual(CARDS);
  expect(https.get).toHaveBeenCalledTimes(1);
});

test("refetches after the 5-minute TTL expires", async () => {
  let now = 1_000_000;
  const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
  https.get.mockImplementation(respondWith(BODY));

  await fetchCardsFromCDN();
  now += 5 * 60 * 1000 - 1;
  await fetchCardsFromCDN();
  expect(https.get).toHaveBeenCalledTimes(1);

  now += 2; // past expiry
  await fetchCardsFromCDN();
  expect(https.get).toHaveBeenCalledTimes(2);
  nowSpy.mockRestore();
});

test("cacheBust bypasses the cache in both directions", async () => {
  https.get.mockImplementation(respondWith(BODY));

  await fetchCardsFromCDN(); // populates the cache
  await fetchCardsFromCDN({ cacheBust: true }); // must hit the network
  expect(https.get).toHaveBeenCalledTimes(2);

  await fetchCardsFromCDN(); // original cached copy still serves
  expect(https.get).toHaveBeenCalledTimes(2);
});

test("does not cache failures: a rejected fetch is retried by the next call", async () => {
  https.get
    .mockImplementationOnce(failWith(codedError("ENOTFOUND", "getaddrinfo ENOTFOUND")))
    .mockImplementationOnce(respondWith(BODY));

  await expect(fetchCardsFromCDN()).rejects.toThrow("getaddrinfo ENOTFOUND");
  await expect(fetchCardsFromCDN()).resolves.toEqual(CARDS);
  expect(https.get).toHaveBeenCalledTimes(2);
});

test("does not cache a malformed payload (missing cards key)", async () => {
  https.get.mockImplementation(respondWith(JSON.stringify({ notCards: [] })));

  await expect(fetchCardsFromCDN()).resolves.toBeUndefined();
  await fetchCardsFromCDN();
  expect(https.get).toHaveBeenCalledTimes(2);
});
