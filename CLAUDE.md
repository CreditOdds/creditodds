# CreditOdds Project Notes

## Git Workflow

- **Always create a new branch** when making changes to the project
- Do not commit directly to main
- Create a PR for code review before merging

## Project Structure

- `apps/api/` - AWS SAM Lambda backend
- `apps/web-next/` - Next.js frontend
- `data/cards/` - YAML card definitions

## Deployment

- Backend: `cd apps/api && sam build && sam deploy`
- Frontend: AWS Amplify, triggered by webhook. Amplify native auto-build is
  disabled (`enableAutoBuild=false`) so each merge builds exactly once.
  Code pushes to `main` fire the webhook via `.github/workflows/deploy-frontend.yml`;
  card/best/article/news data pushes fire it from their own `build-*.yml`
  workflow after syncing JSON to S3.
- Cards data: Run `npm run build-cards` in web-next to rebuild cards.json

### Backend CI/CD: GitHub Actions (`deploy-api.yml`)

The `CreditCardOddsAPI` CodePipeline + `CreditCardOddsAPI-Builder` CodeBuild
project were **deleted on 2026-05-08**. They had been pointing at the
obsolete pre-monorepo `CreditCardOdds/creditcardodds-api` repo (different
GitHub org from this monorepo). Triggering the pipeline pulled that stale
template — missing 20+ Lambdas added since the migration — and CloudFormation
deleted those functions from production. Recovery required a manual
`aws cloudformation deploy` with full param overrides + a freshly generated
`IpHashPepper` (the previous value lived only on the deployer's machine
and was wiped from the stack when the broken template was applied).

Backend deploys now run through `.github/workflows/deploy-api.yml`: any push
to `main` that touches `apps/api/**` runs `sam build && sam deploy` on a
GitHub Actions runner — one deploy per merge, mirroring `deploy-frontend.yml`.
It authenticates with AWS via GitHub OIDC (no stored keys) using the
`GitHubActions-CreditOdds-Deploy` IAM role, and reuses the stack's existing
parameter values, so the NoEcho params (DB creds, `IpHashPepper`,
`GooglePlacesApiKey`) never touch CI.

GitHub Actions runs against the actual monorepo checkout, which structurally
rules out the stale-repo failure that took down the old CodePipeline. The
leftover `apps/api/buildspec.yml` is dead (it was the CodeBuild build spec).

Manual deploy still works: `cd apps/api && sam build && sam deploy`, or the
workflow's `workflow_dispatch` button. On a brand-new machine the first
manual deploy needs `--parameter-overrides` for the NoEcho params; the stack
remembers them after that.

## Database

- MySQL database hosted on AWS
- Migrations in `apps/api/migrations/`
- Run migrations with `node scripts/run-migration.js <migration-file>`
