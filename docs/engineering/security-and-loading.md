# Browser security and request budgets

Review items 12–13, implemented October 21, 2026.

## Dependencies and deployment

- Firebase Admin 14.5.0 uses modular `/app` and `/auth` entrypoints throughout the API, admin CLI and Firebase signup function. Firebase Functions is 7.4.0. Local tooling requires Node 22.23.4 or later within Node 22; `.nvmrc` pins the version used by local development, GitHub Actions and Amplify builds. Lambda (`nodejs22.x`) and Firebase (`engines.node: "22"`) select managed major-version runtimes; their patch rollout must be verified separately with the providers.
- Updated compatible transitives, pinned the Firebase web SDK's transitive gRPC to 1.14.6, and upgraded Jest/Vitest to remove their critical development-tooling finding. Keep `@firebase/app` at 0.16.2 until Lambda moves to Node 24.
- Root, API and Firebase Functions have lockfiles. Update the root lock and the affected deployment lock together. Standalone API/Functions installs do not inherit root overrides; audit those independently.
- Tailwind plugins are build dependencies, now correctly declared as development dependencies. This reclassification does **not** fix their advisories.
- At validation: root production audit **0** affected entries (previously 27); standalone API and Functions production audits **0**. All-dependency audit: **34** affected entries, **0 critical**, **9 high**, **22 moderate**, **3 low**. Counts include parent packages, not distinct vulnerabilities.
- Remaining findings are development/build paths: Tailwind/Next ESLint glob parsing (`braces` has no patched 3.x release), selector parsing, Vite's development server/editor integration, Jest coverage/configuration/notifier transitives and jsdom. Do not expose development/test servers publicly or run untrusted configs. Address these in supported toolchain upgrades; the audit's suggested Next downgrade is inappropriate. These findings remain open and are not suppressed.

References: [Firebase Admin release notes](https://firebase.google.com/support/release-notes/admin/node), [Next CSP guidance](https://nextjs.org/docs/app/guides/content-security-policy), [Next JSON-LD guidance](https://nextjs.org/docs/app/guides/json-ld).

## Browser policy

`security-policy.mjs` builds an enforced CSP with configured API/Auth origins, Firebase, analytics and image hosts. Production blocks eval, objects, framing and unlisted script origins. Development permits eval/WebSockets for HMR. Static Next pages still require `unsafe-inline`; this policy is not a complete defense against arbitrary inline script injection. Removing that allowance requires build-time hashes or a deliberate switch to dynamic rendering with nonces.

All JSON-LD emitters use `serializeJsonLd`, escaping `<` so a content string cannot close its script element. `/api/csp-report` accepts legacy and Reporting API bodies, limits streamed input to 16 KiB and 2 seconds, and logs only allowlisted directives and blocked origins. Query strings, document URLs, credentials and samples are discarded. Its 20 reports/minute budget is per server instance and limits logging, not distributed request traffic. Reports appear as `csp_violation` in web-server logs.

## Request and loading behavior

| Read | Attempt deadline | Total budget | Retries |
| --- | --- | --- | --- |
| Uncached fetch wrapper | 4 seconds | 10 seconds | Up to 4 for GET/HEAD, inside budget |
| Public Next cached/ISR reads | Native transport/platform limits | No application wall-clock timer | Up to 4 foreground retries |
| Optional card sections | Inherit wrapper | 2.5 seconds per concurrent group | Inside section budget |
| Places | 8 seconds, including body | 8 seconds | None |
| Brevo operation | 8 seconds, including body | 15 seconds including backoff | Only explicit 429 responses; never ambiguous writes |
| API card catalog CDN | 5 seconds, including connection/body | 10 seconds | One transient-network retry |

Uncached caller cancellation stops retry/backoff. Explicitly cached public server reads use native Next caching and do not receive application wall-clock deadlines. Caller-provided cancellation is still honored. See the server-cache rollback section below for the production limitation.

Ratings, wire and product-change reads now run concurrently after the primary card lookup. Other optional sections and the local benefits lookup have independent short budgets. A stalled optional read falls back to the existing empty-section behavior; the primary card lookup still propagates outages and distinguishes a confirmed 404. The benefits overlay uses an asynchronous cached slug index instead of repeated synchronous full-file parsing. Edge OG generation imports a small public-card fetcher and pure article-tag metadata, eliminating the nine cross-runtime import warnings.

Nearby lookup waits for all concurrent DB users to settle before its `finally` cleanup. The Places cache is capped at 256 entries. These are request-scoped robustness fixes; distributed Places quotas, a global DB query budget and database isolation remain separate work.

## Image freshness and measurement

`VERSION_CARD_IMAGES=1 npm run build:cards` (the publishing workflow) produces content-hashed art filenames in the catalog and writes artifacts to `.build/card-images`. The cards workflow uploads these **before** publishing the catalog, with immutable caching and without deleting older hashes. Replacing art changes its URL, so Next generates a fresh optimized variant despite its 30-day cache. Local development keeps existing CDN filenames until hashes are published. Legacy filenames remain for old links and CDN-only art; source-CDN invalidation alone still cannot refresh an existing optimized legacy URL.

Core Web Vitals now use the existing PostHog transport (`web_vital`): metric, numeric value, rating, route group and mobile/desktop class. Route groups omit identifiers and query strings. Query p75 LCP/INP/CLS by route/device after deployment. No field percentile or cost improvement is claimed from local smoke tests. Dashboard/alerts for p95 SSR/API latency, DB connections, cache hits, cold starts and Places cost still need operational configuration. Streaming/pagination and a broader split of catalog metadata from DB aggregates should follow measured bottlenecks rather than this change silently altering API contracts.

## Validation

- Clean root lockfile installation; production dependency audits for root/API/Functions.
- 323 tests passed (227 web, 95 API, 1 image-versioning test), covering deadlines, stalled bodies, caller cancellation, retry safety, concurrent card sections, DB cleanup, modular Firebase initialization, report sanitization and JSON-LD escaping.
- Full production Next build (614 pages); full SAM build and Firebase Functions load smoke test.
- Mobile Chromium checks on home, explore, card, news and login: HTTP 200, no page errors or unexpected CSP violations. Separate tests blocked an unlisted external script and an eval call and observed report delivery. Signed-in account flows were not exercised with a real user account.
- Existing repository lint baseline remains 18 errors and 1 warning; changed frontend files introduce none.

## Deployment artifact limit

Amplify rejected the initial deployment at 252,050,372 bytes (limit 230,686,720). The card route now prebuilds at most 80 active/high-data cards; other cards render on demand and use the same 5-minute ISR cache. `dynamicParams = true` preserves all card URLs, and `dynamic = 'force-static'` explicitly enables runtime static caching. Sitemaps/catalog coverage is unchanged. This follows the store route's existing bounded-prerender approach. The first visit to a non-prebuilt card can be slower; subsequent requests use ISR. See [Next's subset prerendering guidance](https://nextjs.org/docs/app/api-reference/functions/generate-static-params#subset-of-paths-at-build-time).

## Lambda Node module compatibility

Lambda Node 22 disables require(ESM), unlike local Node 22. Firebase Admin 14's jwks-rsa/jose chain needs it. The SAM global `NODE_OPTIONS` explicitly enables `--experimental-require-module` while retaining the Sentry preload. The initial production authorizer check exposed this difference; the runtime setting was corrected and an invalid-token probe must return 401, not 500. See [AWS runtime documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html#nodejs-experimental).

## News refresh timeout resilience (superseded)

The worker-local news snapshot described below was an interim mitigation. It has been removed in favor of the shared Next Data Cache lifecycle below.

Sentry issue 7805642165 reported the wrapper's 10-second deadline on `/news/[id]`. CloudWatch showed the errors within milliseconds of a Lambda invocation starting, with that invocation completing in under one second. This is consistent with background work resuming after an idle/frozen interval; the logs do not identify the upstream delay or establish the visitor's HTTP status. A subsequent probe returned HTTP 200 from the route cache.

News detail metadata and rendering now share concurrent catalog reads. Each worker keeps its most recently successful detail-lookup catalog: on a `TimeoutError` only, an existing story can use this snapshot for up to one hour after the successful read. A warning records fallback use. Cold workers, expired snapshots, missing IDs, invalid catalogs, HTTP failures and explicit cancellation still propagate errors; fallback never establishes a 404. Successful empty or updated catalogs replace the snapshot, including removals. Normal route ISR can cache a fallback render for its existing five-minute interval. This mitigates warm-worker refresh failures; it does not guarantee availability on a cold-worker CDN outage.

Completed fetches and optional reads no longer abort their signals during cleanup, allowing Next's other response-stream branch to finish cache work. Failed or stalled requests still abort and retain their existing budgets. News view counts now receive the optional-section 2.5-second budget and cancellation signal. Regression coverage includes shared requests, recovery after rejection, fallback expiry/removal, missing IDs and successful signal cleanup.

## Shared fetch/cache lifecycle (superseded)

The custom `unstable_cache` layer below was rolled back after post-deployment errors continued. It is retained here as incident history, not the current implementation.

The former wrapper placed a deadline around Next's patched fetch. In Next 16.4.2, stale revalidation strips the caller's signal and shares pending refresh promises. Retrying that outer operation can rejoin work the deadline cannot cancel. This is especially problematic when ISR work resumes after a Lambda idle interval. The replacement keeps the complete bounded retry/body-read operation **inside** `unstable_cache`. Its underlying fetch uses `cache: 'no-store'`, with no nested `next.revalidate`; each attempt owns its signal. Next owns cache freshness, persistence, tags and stale-on-refresh-error. This uses the existing Data Cache without enabling Cache Components or changing the site's rendering model. See [Next's cache API](https://nextjs.org/docs/app/api-reference/functions/unstable_cache).

Only explicitly cached server GET/HEAD reads with public options are eligible. Browser requests, credentials, authorization/cookie/custom headers, mutations and no-store requests bypass the shared cache. Cache identity includes URL, method, accept headers, retry options and cache options. At most 256 in-flight public transport operations are tracked per worker; each entry is removed on success or failure. Excess concurrent keys run independently. Metadata and rendering can share a complete read without retaining rejected promises. Each consumer receives its own buffered Response, including a null body for HEAD.

Caller signals are never captured by a shared refresh. An optional section may stop waiting after 2.5 seconds while a cache fill continues within its own 10-second budget. Fresh cache hits create no transport timers. HTTP errors other than 404, malformed JSON, private/no-store responses and responses setting cookies are not persisted. A cold failure remains a real failure; a failed refresh preserves the previous persistent cache value. A genuine 404 replaces a deleted resource. Next's existing stale-on-error behavior has no one-hour cutoff; this is distinct from the removed worker snapshot. Sustained origin outages still need monitoring, and cold requests can still fail. Sentry's timeout filtering is unchanged.

`npm run test:cache-lifecycle --workspace=@creditodds/web-next` creates an isolated production Next app and controllable local origin, then removes them. It tests cold and expired ISR reads, metadata/page request sharing, cold HEAD, failed HEAD-triggered refresh, dynamic stale/background reads, body cancellation, process pause/resume, 5xx and malformed JSON preservation, recovery, independent caller cancellation, and genuine 404 deletion. No fixture routes ship. The suite runs on frontend pull requests in `test-fetch-cache-lifecycle.yml`; ordinary unit tests still cover deadline limits, replay safety and caller cancellation.

## Server-cache rollback after continued Lambda timeout errors

Issue 7805905496 on the homepage occurred after the previous cache refactor. At 03:29:10 UTC on October 22, CloudWatch logged the deadline about 64 ms after the invocation started; the invocation finished in 785 ms. Other cache-refresh errors involved news, articles, cards and view counts. These observations point to resumed work, not a new ten-second wait within that invocation. The earlier runtime test covered suspension only with an already-populated cache; it did not establish safety for cold-cache work.

The containment restores native Next fetch caching and first-attempt render memoization for explicitly cached public server GET/HEAD reads. Retries use a fresh non-aborting signal to bypass a memoized failure, as before the deadline rollout. There is no process-global in-flight map, no custom persistent response serialization, and no application wall-clock deadline attached to ISR/cache-owned reads. Caller cancellation remains supported. Browser/uncached requests retain bounded attempts and total deadlines, and API deadlines are unchanged. Sentry error filters are unchanged; native transport failures still surface.

This deliberately trades the new ten-second server-cache budget for compatibility with a host that can suspend unfinished work. A genuinely stalled origin is bounded by native transport/platform behavior and can take longer; this is a rollback/containment, not a claim that every origin outage is solved. A durable replacement needs a verified invocation-lifetime integration or an architecture that does not perform timed network work after the response ends.

The production Next fixture now covers **cold-cache suspension** while a healthy origin response arrives, as well as expired caches, HEAD-triggered regeneration, dynamic background reads, recovery and deletion. It asserts that no application `Request deadline exceeded` is synthesized for cache-owned work. Unit tests retain uncached deadline/body-cancellation coverage and verify that native timeout failures are not hidden.
