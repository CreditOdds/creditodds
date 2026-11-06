# Static hosting validation — November 6, 2026

Branch: `codex/static-amplify-hosting`, created from local `main`. No deployment, push, merge, AWS mutation, database migration or production data deletion was performed.

| Check | Result |
| --- | --- |
| Production build | PASS, Node 22.23.4, `npm run build:web-next`; Next 16.4.2. 3,797 generated routes; static-generation phase 73 seconds on this laptop. No dynamic/request-time routes in the build output. |
| Export completeness guard | PASS; 230 cards, 183 news pages (including 25 older summary-only URLs), 1,127 stores, plus articles/best/banks. 1,617 data-derived page paths checked against actual exported files. All dynamic-route fallbacks disabled. |
| Artifact | 11,824 files; 700,284,896 bytes (~668 MiB actual data). Includes static HTML, RSC navigation data, social images and assets, not a server bundle. No node_modules, server directory, .env files or source maps in `out`. |
| Images | 369 source URLs; 1,245 deduplicated WebP variants, 8,042,436 bytes total (~7.67 MiB). No `/_next/image` URLs in sitemap HTML. Browser representative images load successfully. |
| Static HTTP crawl | PASS; all 1,623 sitemap URLs return 200 with headings and canonical metadata. All 183 news URLs return 200. Three unknown paths return 404. Four existing/alias redirects return 301. Static content JSON, robots and security headers checked. |
| Chromium against plain static server | PASS; home, explore, card, encoded bank URL, news/articles, store, odds, recommendation form, login/register/forgot; converter arithmetic; query-selected comparisons and reload; client-side card navigation and reload; profile redirects to login. No application page errors in final run. |
| Test isolation | Telemetry configuration mocked and telemetry sends suppressed. Production API POSTs suppressed in the final browser run (3 view/event requests). Public API GETs remain real. No test account or production submission created. |
| Frontend tests | PASS: 248 tests in 23 files, including migrated recommendation/CSP handler contracts and existing ranking/math/auth-related utility coverage. |
| Backend tests | PASS: 96 tests in 11 suites. |
| SAM | PASS: full template `sam validate --lint` and full `sam build`, including new TypeScript handlers. No deploy executed. |
| API access | Live `/wallet` without a token returns 401 on both configured regional domain and legacy CloudFront hostname. Regional custom domain maps to existing API `jy69cgjk02`, stage `Prod`, us-east-1. |
| Hosting configuration | Root build/header YAML parses; root build specification matches the app specification and publishes `out`. Existing live Amplify config inspected read-only: `WEB_COMPUTE`, `Next.js - SSR`, native auto-build false, old homepage 404 fallback. Changes to `WEB`/`Web` are prepared, not applied. |
| Browser secrets boundary | No mysql package, Firebase service-account, origin-verification secret or Places API key identifiers found in exported browser JS. Shared recommendation module imports only ranking code at runtime; its frontend Card import is type-only. |
| Diff hygiene | `git diff --check` passes. Generated data JSON changes from build execution removed from the review diff; builds regenerate them. Pre-existing scratch files, backlog, source-map script and source-map integration preserved. |
| Lint | NOT CLEAN: 18 errors and 2 warnings from existing code. Only the recommendation client among the failing files was touched; its two hook errors reproduce when linting the `main` version. Other reported files are unchanged. No new lint findings from the static-export scripts/routes. |

The browser test initially hit the production Firebase Analytics configuration endpoint's 403 restriction from localhost. The final harness mocks **only telemetry configuration**, rather than changing product authentication or suppressing application errors. Google/email successful sign-in and authenticated mutation flows were not exercised without a test account. The signed-out UI/redirect and real backend rejection checks are verified; full account smoke tests remain a deployment gate.

Amplify rewrite processing, clean-URL resolution, MIME/security header application, platform retention, live migrated endpoints, and stopped SSR billing cannot be proven without the explicitly approved deployment. The local static server checks the prepared behavior but is not Amplify. Validate compatibility POST rewrites for cached older clients as well as the new direct API URLs after deployment. If Amplify reclassifies the application as compute, stop and use the rollback plan; do not claim savings from static source changes alone.

Static snapshot tradeoffs: public content/stats refresh on a successful rebuild; new images may show a generic fallback until rebuilt; comparison query links use a generic social preview; the news sitemap's two-day window is fixed at build time. Firebase authentication, backend authorization, account data, submissions, calculators, and personalized recommendations remain supported by the implementation.

See [deployment, publishing, rollback, and cost verification](static-hosting.md) for the exact commands and post-deployment gates.
