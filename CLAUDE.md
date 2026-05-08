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
- Frontend: Deployed via AWS Amplify (automatic on push)
- Cards data: Run `npm run build-cards` in web-next to rebuild cards.json

### Backend CI/CD: there is none — `sam deploy` is the only path

The `CreditCardOddsAPI` CodePipeline + `CreditCardOddsAPI-Builder` CodeBuild
project were **deleted on 2026-05-08**. They had been pointing at the
obsolete pre-monorepo `CreditCardOdds/creditcardodds-api` repo (different
GitHub org from this monorepo). Triggering the pipeline pulled that stale
template — missing 20+ Lambdas added since the migration — and CloudFormation
deleted those functions from production. Recovery required a manual
`aws cloudformation deploy` with full param overrides + a freshly generated
`IpHashPepper` (the previous value lived only on the deployer's machine
and was wiped from the stack when the broken template was applied).

If you want CI/CD back, build a new pipeline pointing at this monorepo:
- New CodeStar connection authorized for the `CreditOdds` GitHub org
- Source: `CreditOdds/creditodds` (branch `main`), with a path filter so
  it only triggers on `apps/api/**` changes
- CodeBuild project with `BuildSpec: apps/api/buildspec.yml`
- Deploy stage's `ParameterOverrides` must wire in `IpHashPepper`,
  `GooglePlacesApiKey`, and the DB creds (DB creds live in SSM at
  `/creditodds/db/{endpoint,database,username,password}`)

Until then: `cd apps/api && sam build && sam deploy`. The first time on a
new machine you'll need `--parameter-overrides` for the NoEcho params; the
stack remembers them after that.

## Database

- MySQL database hosted on AWS
- Migrations in `apps/api/migrations/`
- Run migrations with `node scripts/run-migration.js <migration-file>`
