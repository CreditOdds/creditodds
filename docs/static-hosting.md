# Static Amplify hosting migration

Status: **deployed and verified November 6, 2026**. Amplify job 1907 completed at 22:49:25 UTC. Production uses `WEB` / `Web` and static `out` artifacts; no SSR log events were observed after the first static cutover at 22:10:08 UTC. Production rollout results and fixes are recorded in `docs/static-hosting-validation.md`. Future publishes use the workflow below.

## Design and audit

Keep Next.js 16 and the existing Amplify app `d172gkg36enjcy` in `us-east-2`. Export HTML, RSC navigation files, JSON, images, robots and sitemaps into `apps/web-next/out`. No framework rewrite, new provider, PWA, service worker, or scheduled rebuild is introduced.

| Surface | Static behavior |
| --- | --- |
| Card pages | All 230 catalog slugs, including archived cards; removed the 80-page cap and request-time fallback. Public stats, ratings, records, referrals, related content and product-change summaries are build snapshots. Existing interactive submissions still use the API. |
| Store directory | All 1,127 stores; removed the 100-page cap and request-time fallback. Personalized wallet picks still use authenticated backend endpoints. |
| News, articles, best lists, banks, author/category directories | Generated from complete catalogs; new slugs require a successful rebuild. Existing canonicals, structured data and useful HTML remain. |
| `/api/news`, `/api/articles`, `/api/best` | Static GET JSON files, generated from the same source revision as the pages; no proxy or runtime Lambda. |
| Recommendations | `/best-card-for-me` POST on the existing SAM API, sharing the original ranking, preferences, explanations and response shape. Anonymous use remains supported; response is `no-store`. Body bounded to 16 KiB. One catalog load from the existing public cards API/CDN, deduplicated with a five-minute warm-instance cache and eight-second timeout; no new database connection or credentials. |
| CSP reports | `/csp-report` POST on the existing SAM API. Preserves bounded bodies, scrubbed log fields, and per-instance log budget; no database use. CSP points directly to the API. |
| Social images | All route-specific Open Graph/Twitter images generated at build time. `/api/og/compare` serves a static comparison image. |
| Comparison query links | `?cards=a,b` still selects cards in the browser and survives refresh. Metadata now uses one `/compare` canonical and generic comparison preview; query-specific titles/images are intentionally no longer server-rendered. |
| Login, account, wallet, admin, submissions, check-odds | Existing Firebase browser authentication and bearer-token API calls retained. No privileged credentials moved to the browser; existing Lambda authorizers remain in place. |
| Images | Custom Next loader uses 32/96/256/640/1200px WebP files, also for Markdown body images. SVGs stay vectors. No `/_next/image` runtime. Unknown/new API image filenames display the existing generic card until a rebuild, never a large original download. Affiliate creatives retain their existing external delivery. |
| Sentry/PostHog | Browser reporting retained. Removed Next's `/monitoring` Sentry tunnel; browser sends directly to Sentry under the existing CSP allowlist. Existing uncommitted PostHog source-map uploader is preserved and runs when present, with its processed chunks copied into `out`. A checkout without that unrelated untracked script still builds; all exported source maps are removed. |
| Hosting rules | Existing three content redirects plus `/_admin` → `/admin`; compatibility reverse proxies for old recommendation/CSP URLs; custom `/404.html` response with HTTP 404 (Amplify first adds a trailing slash to unknown extensionless paths), no SPA homepage fallback. |

Route-level five-minute ISR is removed. Remaining `next.revalidate` hints on shared public data helpers are build-time fetch deduplication only: there is no server to execute them after export. The build clears Next's public fetch cache so a later publish refreshes data. Browser fetching, retries and polling were not increased. The catalog is fetched once before the build and shared across all page and social-image workers; client catalog consumers retain their existing in-flight deduplication.

Image originals and variants are cached in `.static-cache` between builds. Use a new filename for changed art (also required by the previous CDN caching policy), or build once with `STATIC_REFRESH_IMAGES=1` to refresh sources. Content-hashed variant filenames support immutable caching. The preparation script rebuilds cards, news, articles, best lists and stores from the checked-out revision. A missing required catalog/image fails preparation instead of silently publishing an incomplete directory. Existing optional statistical API reads can still show their established empty-state fallback during outages.

The news sitemap is a build snapshot, including the publication timestamps and two-day window as of that build. It does not expire entries without a rebuild. Ordinary sitemap URLs remain usable. Do not schedule frequent builds solely to trim that list.

## Validation

Use Node from `.nvmrc` (22.23.4), then from the repository root:

```sh
npm ci
npm run build:web-next
npm test -w @creditodds/web-next
npm test -w @creditodds/api -- --runInBand
sam validate --lint --template-file apps/api/template.yml
sam build --template-file apps/api/template.yml --build-dir /tmp/creditodds-static-sam
node apps/api/scripts/verify-bundled-handlers.js /tmp/creditodds-static-sam
```

For the static-site check, run these in separate terminals:

```sh
cd apps/web-next
npm start
```

```sh
cd apps/web-next
npm run test:static
```

`npm start` is a plain static file server with clean URL resolution, redirect/404 rules and hosting headers. It does not run Next or fake a backend. The browser test mocks telemetry configuration and suppresses analytics and production API writes; live public GETs remain real. Recommendation/CSP handler tests cover request/response behavior locally without deployment or database writes.

Results and limitations are recorded in `docs/static-hosting-validation.md`. Authenticated success flows require a test account and the approved deployment; do not infer production sign-in/write success from logged-out browser checks. Global lint has existing failures; the two errors in the modified recommendation client reproduce on `main` and all other reported files are unchanged by this migration.

## Publishing without a timer

Use the existing **Deploy Frontend** GitHub Actions workflow (`workflow_dispatch`) for an intentional refresh of public snapshots. After deployment approval and rollout, existing code/content-change triggers can remain: they build on actual changes, not every five minutes. Keep Amplify native auto-build disabled, as it is now. Batch related edits into one content change when practical. Do not add a periodic frontend rebuild job.

Production and local frontend settings both use `https://api.creditodds.com`, a regional API Gateway custom domain mapped to `jy69cgjk02` / `Prod` in us-east-1. No domain mapping change is needed. The legacy fallback API CDN was also inspected read-only: distribution `E2IVU8Y8I7H6WK` forwards all methods and viewer headers except Host, with all query strings. It only caches GET/HEAD, so the new POST/OPTIONS routes need no distribution change. Its minimum GET TTL is 60 seconds; that setting is outside this migration and must not be reused for a future personalized GET endpoint.

Existing `build-cards`, `build-news`, `build-articles`, and `build-best` workflows still publish backend/CDN data and trigger a rebuild. Admin changes that update database rows take effect immediately in authenticated API views; public HTML needs a rebuild. New content URLs should only be announced after their frontend build succeeds; current content workflows enqueue social posts independently of frontend build completion, so confirm the Amplify job before scheduling an announcement. If data workflows are deliberately run without a frontend publish, newly announced links can 404 until the next build.

`apps/web-next/amplify.yml` is the editable build specification. `scripts/hosting-config.mjs` mirrors it to repository-root `amplify.yml` (the location Amplify reads) and generates root `customHttp.yml` plus `hosting/custom-rules.json`. Regenerate after changing public endpoint settings and review both root files. Only `NEXT_PUBLIC_*` variables belong in the frontend bundle; database credentials, service accounts, origin verification secrets and third-party privileged keys stay in the existing backend/CI secret stores.

## Deployment — only after explicit approval

Do not simply deploy this output to the existing `WEB_COMPUTE` configuration. Read-only inspection on November 6, 2026 found:

- App platform `WEB_COMPUTE`; main branch framework `Next.js - SSR`.
- Native main auto-build disabled; app auto-branch creation disabled.
- Console build specification publishes `.next`.
- Current fallback `/<*>` → `/index.html`, status `404-200`.

AWS's automatic Next 14+ SSG integration still uses `WEB_COMPUTE` and `.next`. This migration instead publishes a **generic static Web artifact**: platform `WEB`, branch framework `Web`, explicit `out` build specification. The exporter has no compute bundle. Postbuild gives extensionless JSON/social-image route handlers `.json`/`.png` backing files and hosting rewrites retain their public URLs, including slash aliases for cached redirects. Exported HTML also gets directory `index.html` copies to preserve trailing-slash navigation without wildcard rewrite loops. Bank routes explicitly rewrite to `.html` because dots in `U.S. Bank` disable Amplify’s implicit HTML lookup. Use status `404-200` for the custom error rewrite: live validation showed `404` redirects to `/404.html` with 302, while `404-200` returns HTTP 404. The deployment gate below is necessary: a successful `next build` alone does not prove that Amplify stopped compute billing.

1. Record the approved commit and existing production commit/job. Save rollback settings privately before any mutation. Commands below run from the repository root. The selected AWS fields exclude environment variables/secrets:

   ```sh
   mkdir -p /tmp/creditodds-static-rollback
   chmod 700 /tmp/creditodds-static-rollback
   aws amplify get-app --app-id d172gkg36enjcy --region us-east-2 \
     --query 'app.{appId:appId,platform:platform,buildSpec:buildSpec,customRules:customRules,customHeaders:customHeaders}' \
     > /tmp/creditodds-static-rollback/app.json
   aws amplify get-branch --app-id d172gkg36enjcy --branch-name main --region us-east-2 \
     --query 'branch.{framework:framework,enableAutoBuild:enableAutoBuild}' \
     > /tmp/creditodds-static-rollback/branch.json
   aws amplify list-jobs --app-id d172gkg36enjcy --branch-name main --region us-east-2 --max-results 5 \
     > /tmp/creditodds-static-rollback/jobs.json
   git rev-parse main > /tmp/creditodds-static-rollback/previous-main.txt
   ```

2. Temporarily disable only the frontend-triggering GitHub workflows before merging (Deploy Frontend, Build and Deploy Cards/News/Articles/Best). Record which were enabled. This avoids a webhook deploying static code while the platform is still `WEB_COMPUTE`. Wait for already-running frontend jobs to finish. The backend workflow may deploy on merge; coordinate it as step 3. Do not disable unrelated services or delete resources/data.

3. Deploy the two new handlers to the **existing backend in us-east-1**, not the frontend's us-east-2 region. Prefer the existing **Deploy API** workflow on the approved commit. Equivalent from `apps/api`, using existing AWS stack parameters:

   ```sh
   sam build
   sam deploy --stack-name CreditCardOddsAPI --resolve-s3 --s3-prefix CreditCardOddsAPI \
     --region us-east-1 --capabilities CAPABILITY_IAM --confirm-changeset
   ```

   The new handlers use CommonJS entry wrappers so the existing Sentry layer can wrap their exports. Keep the bundled-handler check in Deploy API; direct bundled TypeScript exports are non-configurable and fail during Lambda initialization.

   Inspect the changeset: expect two new functions/routes plus the normal API deployment; no database deletion/migration. Existing NoEcho parameters must be reused. Verify the regional custom-domain routes work. If testing the legacy CloudFront hostname too, its distribution already forwards POST/OPTIONS, query strings and Content-Type and does not cache those methods. Do not enable caching of personalized responses. Before frontend rollout:

   ```sh
   curl -i -X OPTIONS https://api.creditodds.com/best-card-for-me \
     -H 'Origin: https://creditodds.com' -H 'Access-Control-Request-Method: POST'
   curl -i https://api.creditodds.com/best-card-for-me \
     -H 'Content-Type: application/json' \
     --data '{"spend":{"groceries":12000},"walletSlugs":[]}'
   curl -i https://api.creditodds.com/csp-report \
     -H 'Content-Type: application/csp-report' --data '{"csp-report":{}}'
   ```

   Expect 204/200/204 respectively, correct CORS, and `Cache-Control: no-store`. The recommendation check is a read-only calculation; the empty CSP report should not create a violation log. If an existing behavior restricts routes or methods, update only that API distribution behavior after reviewing it.

4. With the approved source in main and triggers still paused, install the prepared hosting settings:

   ```sh
   aws amplify update-app --app-id d172gkg36enjcy --region us-east-2 --platform WEB \
     --build-spec file://amplify.yml \
     --custom-rules file://apps/web-next/hosting/custom-rules.json
   aws amplify update-branch --app-id d172gkg36enjcy --branch-name main --region us-east-2 \
     --framework Web --no-enable-auto-build
   aws amplify start-job --app-id d172gkg36enjcy --branch-name main --region us-east-2 --job-type RELEASE
   ```

   Root `customHttp.yml` supplies security, cache and extensionless JSON/image content-type headers on redeploy. The build uploads `out` only. Whenever the generated custom rules change, apply them with `update-app`; publishing repository JSON alone does not change Amplify rules. Keep `.next/server`, `.env*`, `node_modules`, `.static-cache` and source maps out of the published artifact. Allow time for the platform change and redeploy; an in-place platform change may interrupt service, so use a quiet window.

5. Check the returned job ID until `SUCCEED` with `aws amplify get-job --app-id d172gkg36enjcy --branch-name main --job-id JOB_ID --region us-east-2`. Inspect build/deploy logs: static artifacts must come from `out`, with no Next SSR adapter or compute packaging. Read `get-app`/`get-branch` again: platform must remain `WEB`, framework `Web`. **If Amplify reclassifies the app or provisions compute, stop and roll back; do not claim SSR savings.** No hosting-provider migration is authorized or necessary to this plan.

6. Run the post-deployment checks below, then re-enable only previously enabled workflows. Leave Amplify native auto-build off. Do not restore the old SPA fallback.

## Rollback

For this rollout, the durable private backup is `/Users/maxwellmelcher/.codex/deployment-backups/creditodds-static-20261106/`; `restore-app.json` is the saved app input with null fields removed. The pre-migration source commit is `8d73186ba56268a48e526986f98af89beb9a3454`. Job 1904 is the last prior SSR release, but its recorded revision is `HEAD`, so do not rely on retrying it to restore old source.

1. Pause the same frontend triggers. Do not remove the new backend routes: they are additive and safe for the former frontend, and removing them could break cached new clients.
2. Create a rollback branch from current main and reverse only the frontend migration changes under `apps/web-next`, plus the root hosting files. For an immediate rollback before any later frontend changes, restoring `apps/web-next` from the saved pre-migration commit is equivalent. Keep `apps/api` and the backend deployment checks at their current revision so a later API deploy does not remove the additive routes. Review the diff and preserve unrelated/later edits before merging to main. Restore the original source-map integration. Root `amplify.yml` and `customHttp.yml` added by this migration must be removed/reverted too; otherwise they override restored console settings.
3. Restore the saved hosting configuration after the source rollback is merged:

   ```sh
   aws amplify update-app --region us-east-2 \
     --cli-input-json file:///Users/maxwellmelcher/.codex/deployment-backups/creditodds-static-20261106/restore-app.json
   aws amplify update-branch --app-id d172gkg36enjcy --branch-name main --region us-east-2 \
     --framework 'Next.js - SSR' --no-enable-auto-build
   ```
4. Start one RELEASE job of the restored main revision only after platform `WEB_COMPUTE` is restored: `aws amplify start-job --app-id d172gkg36enjcy --branch-name main --region us-east-2 --job-type RELEASE`. Verify original routes, Sentry reporting, redirects and authentication. Re-enable the recorded workflows. Rendering charges resume; retain backend data and all unrelated infrastructure.

## Cost estimate and verification

The supplied November allocation (~$41/month) and rendering share (~$30–$33/month) are estimates, not measured savings. With confirmed `WEB` hosting, frontend render requests/duration should stop. The previous ~$8–$11/month non-rendering allocation remains a starting estimate, not a cap.

At published standard-instance rates, 100 additional build minutes cost ~$1; 10 extra GB served cost ~$1.50. Static storage is ~$0.023/GB-month. Exporting all pages grows the artifact, but visitors download individual files, not the whole export. The optimized image set is about 7.7 MiB of actual WebP bytes across all sizes (roughly 11 MiB filesystem allocation), rather than original images per visitor. The full artifact size and build timing are in the validation report. The first Amplify build took about 11 minutes including installation/cache/artifact work (seven minutes generating pages): roughly $0.11 per publish at the standard build rate, before free-tier credits. Ten similar publishes would be roughly $1.10 in build charges; total monthly cost depends on actual publish frequency.

Budget **$30–$33/month gross rendering savings**. The deployment audit found 10 pre-migration publishes in the preceding seven days, averaging 4.13 build minutes. At that same cadence (~43/month), an 11–14 minute static build adds approximately **$3–$4/month** versus the prior builds (observed static builds ranged from about 11 to 14 minutes). If additional storage/backend/bandwidth costs total another $0–$2/month, revised net savings would be approximately **$24–$30/month**, leaving roughly **$11–$17/month** of the supplied $41 allocation. This estimate uses observed build timing and recent cadence, not billed post-cutover usage; reducing or batching publishes improves it. This is conditional, not a guarantee. Existing API Gateway/Lambda/database, Firebase, content/image CDN and analytics charges remain outside or alongside that allocation. Recommendations and CSP processing move to the backend, so frontend savings must be compared against backend deltas. No fixed infrastructure is added by this change.

Post-deployment plan:

- Immediately: confirm `WEB`/`Web`, static artifact directory, no SSR compute deployment; direct-load and refresh card, bank (including encoded spaces), news/article, store, query-selected comparison, account, tools and unknown routes. Check HTML title/canonical/JSON-LD, robots and sitemaps. Confirm actual 301 and 404 statuses, CSP/HSTS, image/JSON MIME types, WebP sizes, no `/_next/image` or `/monitoring` requests, and client navigation RSC files.
- With a test account: Google/email sign-in, logout, password-reset form, profile/wallet reads, a controlled submission/edit, saved recommendation inputs, authenticated wallet picks and admin access checks. Use a disposable test record only with approval; never delete production data for a test. Confirm missing/invalid tokens are rejected by the existing backend.
- First 24–48 hours: check Amplify/CloudWatch SSR request/duration metrics stop increasing after cutover (allow in-flight requests and metric delay). No new SSR log streams/invocations should appear. Cost Explorer SSR request and GB-hour usage must stop accruing after billing delay. Separate pre-cutover November charges from later usage. If AWS billing is account-wide across apps, isolate this app using available resource/tag dimensions and correlate with app-level metrics; do not assign all account savings to CreditOdds.
- Compare matched 7-day windows before/after and normalize by visits: API Gateway request count/4xx/5xx, Lambda invocations/duration/errors for new and existing handlers, database queries/connections/load, CloudFront bytes/hit rate, Amplify bytes served, and build minutes/count. Check one user action causes one recommendation request; there is no new polling. Inspect CSP report volume for loops. Check backend private responses are `no-store` and CDN cache misses, never cross-user hits.
- At 7 and 30 days: reconcile billed rendering savings against incremental build, API, database and bandwidth cost. Investigate any increase approaching $5/month; the savings claim is confirmed only if total costs fall and rendering stays zero. If costs offset the expected $30–$33, inspect build frequency and traffic before deciding whether to roll back.

Sources: [Next static exports](https://nextjs.org/docs/app/guides/static-exports), [Amplify Next build detection](https://docs.aws.amazon.com/amplify/latest/userguide/deploy-nextjs-app.html), [Amplify platform API](https://docs.aws.amazon.com/cli/latest/reference/amplify/update-app.html), [AWS hosting FAQ](https://github.com/aws-amplify/amplify-hosting/blob/main/FAQ.md), [clean URL/redirect rules](https://docs.aws.amazon.com/amplify/latest/userguide/redirect-rewrite-examples.html), [monorepo headers](https://docs.aws.amazon.com/amplify/latest/userguide/monorepo-custom-headers.html), [Amplify pricing](https://aws.amazon.com/amplify/pricing/).
