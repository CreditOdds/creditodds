# Browser security and request budgets

Review items 12–13, implemented October 21, 2026.

## Dependencies and deployment

- Firebase Admin 14.5.0 uses modular `/app` and `/auth` entrypoints throughout the API, admin CLI and Firebase signup function. Firebase Functions is 7.4.0. Local tooling requires Node 22.12+; deployed runtimes remain Node 22.
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
| SSR/ISR fetch wrapper | 4 seconds | 10 seconds | Up to 4 for GET/HEAD, inside budget |
| Optional card sections | Inherit wrapper | 2.5 seconds per concurrent group | Inside section budget |
| Places | 8 seconds, including body | 8 seconds | None |
| Brevo operation | 8 seconds, including body | 15 seconds including backoff | Only explicit 429 responses; never ambiguous writes |
| API card catalog CDN | 5 seconds, including connection/body | 10 seconds | One transient-network retry |

Caller cancellation stops retry/backoff. Timers and listeners are cleaned up. The fetch wrapper buffers bodies within its deadline so a partial response can be retried safely. Supplying a real abort signal opts out of Next's per-render fetch memoization; persistent `next.revalidate` Data Cache behavior is preserved. Measure upstream request volume after deployment, particularly on cold renders.

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
