// Serves robots.txt for api.creditodds.com.
//
// The API domain has no static origin, so every unmatched path fell through to
// API Gateway's stock 403 ("Missing Authentication Token") — /robots.txt
// included. With no fetchable robots.txt, crawlers had no directive for the
// subdomain and were free to walk all of it; Search Console reported the 403 on
// the root. /cards alone is ~368 KB of JSON, so letting a crawler enumerate
// endpoints is real wasted bandwidth on both sides.
//
// This is a data plane, not content. Disallow everything.
const BODY = ["User-agent: *", "Disallow: /", ""].join("\n");

exports.RobotsHandler = async (event) => {
  console.info("received:", event.httpMethod, event.path);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // The body is a constant, so cache it hard rather than waking a Lambda
      // every time a crawler re-checks.
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
    body: BODY,
  };
};
