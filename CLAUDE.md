# CreditOdds Project Notes

## Git Workflow

- **Always create a new branch** when making changes to the project
- Do not commit directly to main
- Create a PR for code review before merging

## Project Structure

- `apps/api/` - AWS SAM Lambda backend
- `apps/web-next/` - Next.js frontend
- `data/cards/` - YAML card definitions

## Networking & Database Access

- All backend Lambdas (this repo's `CreditCardOddsAPI` stack and the separate
  `CreditOddsSocialPostingService` stack) run inside the `creditodds-network`
  VPC (us-east-2, defined in `infra/network.yml`). Outbound traffic leaves via
  a single NAT gateway Elastic IP — **3.13.85.124** — which is the only
  address the shared Aurora cluster's security group allowlists on TCP 3306.
- The database (`database-3` cluster, us-east-1) is shared with other apps.
  CreditOdds connects as the schema-scoped user `creditodds_app` (grants on
  `creditodds.*` only). Never use the cluster `admin` user. The credential
  lives in SSM Parameter Store (us-east-2): `/creditodds/db/{host,database,username,password}`.
- Consequence: the DB is NOT reachable from a local machine or from any
  compute outside the VPC. Anything that needs SQL access must run as a
  Lambda in the VPC (e.g. `RunMigrationHandler` for migrations).

## Deployment

- Backend: `cd apps/api && sam build && sam deploy`
- Frontend: AWS Amplify, triggered by webhook. Amplify native auto-build is
  disabled (`enableAutoBuild=false`) so each merge builds exactly once.
  Code pushes to `main` fire the webhook via `.github/workflows/deploy-frontend.yml`;
  card/best/article/news data pushes fire it from their own `build-*.yml`
  workflow after syncing JSON to S3.
- Cards data: Run `npm run build:cards` from the repo root to rebuild cards.json

### Backend CI/CD: GitHub Actions (`deploy-api.yml`)

Backend deploys run through `.github/workflows/deploy-api.yml`: any push to
`main` that touches `apps/api/**` runs `sam build && sam deploy` on a GitHub
Actions runner — one deploy per merge, mirroring `deploy-frontend.yml`. It
also exposes a `workflow_dispatch` button for manual runs.

- **Auth**: GitHub OIDC (no stored keys), assuming the IAM role
  `GitHubActions-CreditOdds-Deploy` — trust scoped to this repo's `main`
  ref; currently carries `AdministratorAccess` (a SAM deploy that manages
  IAM/Lambda/API Gateway needs broad rights; tighten later via a
  CloudFormation service role if desired).
- **Parameters**: `sam deploy` is invoked with explicit `--stack-name`,
  `--s3-bucket`, etc. because `apps/api/samconfig.toml` is gitignored.
  Those flags carry no secrets — the stack's existing NoEcho values
  (DB creds, `IpHashPepper`, `GooglePlacesApiKey`) are reused automatically.

GitHub Actions runs against the actual monorepo checkout, which structurally
rules out the stale-repo failure described below. The leftover
`apps/api/buildspec.yml` is dead (it was the old CodeBuild build spec).

Manual deploy still works from a machine that has `samconfig.toml`:
`cd apps/api && sam build && sam deploy`. On a brand-new machine the first
manual deploy needs `--parameter-overrides` for the NoEcho params; the stack
remembers them after that.

**History — why not CodePipeline:** the `CreditCardOddsAPI` CodePipeline +
`CreditCardOddsAPI-Builder` CodeBuild project were **deleted on 2026-05-08**.
They had been pointing at the obsolete pre-monorepo
`CreditCardOdds/creditcardodds-api` repo (different GitHub org from this
monorepo). Triggering the pipeline pulled that stale template — missing 20+
Lambdas added since the migration — and CloudFormation deleted those
functions from production. Recovery required a manual
`aws cloudformation deploy` with full param overrides + a freshly generated
`IpHashPepper` (the previous value lived only on the deployer's machine and
was wiped from the stack when the broken template was applied).

## Database

- MySQL database hosted on AWS (RDS), inside a **private VPC** — not reachable
  from a local machine.
- Migrations in `apps/api/migrations/`, numbered sequentially and
  **single-statement only** (split multi-step changes into `NNNa_*`, `NNNb_*`).
- To run a migration: wire `RunMigrationHandler` into `template.yml`, deploy,
  invoke it, then unwire it. The `apps/api/scripts/run-migration.js` helper only
  works from inside the VPC.
