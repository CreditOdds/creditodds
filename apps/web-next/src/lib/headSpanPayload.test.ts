import { describe, expect, it } from "vitest";
import { stripHeadResponseSize } from "./headSpanPayload";

const SIZE = "http.response_content_length";

const fetchSpan = (method: string, data: Record<string, unknown> = {}) => ({
  op: "http.client",
  description: `${method} https://creditodds.com/best-card-for`,
  data: { "http.method": method, [SIZE]: 409413, ...data },
});

describe("stripHeadResponseSize", () => {
  it("removes the response size from a HEAD fetch span", () => {
    const span = stripHeadResponseSize(fetchSpan("HEAD"));
    expect(span.data).not.toHaveProperty(SIZE);
    // Everything else, including the method, is left alone.
    expect(span.data["http.method"]).toBe("HEAD");
    expect(span.op).toBe("http.client");
  });

  it("keeps the size on a GET so real large payloads still flag", () => {
    const span = stripHeadResponseSize(fetchSpan("GET"));
    expect(span.data[SIZE]).toBe(409413);
  });

  it("falls back to the description when the method attribute is missing", () => {
    const span = stripHeadResponseSize({
      op: "http.client",
      description: "HEAD https://creditodds.com/news",
      data: { [SIZE]: 652332 },
    });
    expect(span.data).not.toHaveProperty(SIZE);
  });

  it("does not use the description fallback when the method says GET", () => {
    const span = stripHeadResponseSize({
      op: "http.client",
      description: "HEAD-looking description",
      data: { "http.method": "GET", [SIZE]: 500000 },
    });
    expect(span.data[SIZE]).toBe(500000);
  });

  it("leaves non-http spans untouched", () => {
    const span = stripHeadResponseSize({
      op: "resource.script",
      description: "HEAD something",
      data: { [SIZE]: 1 },
    });
    expect(span.data[SIZE]).toBe(1);
  });

  it("passes spans without data through", () => {
    const span = { op: "http.client", description: "HEAD https://x" };
    expect(stripHeadResponseSize(span)).toBe(span);
    const nullData = { op: "http.client", description: "HEAD https://x", data: null };
    expect(stripHeadResponseSize(nullData)).toBe(nullData);
  });
});
