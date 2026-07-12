# CreditOdds API

The serverless backend for CreditOdds, built with the [AWS Serverless
Application Model (SAM)](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html).
It runs on AWS Lambda (Node.js 22) behind API Gateway, with a Firebase token
authorizer for authenticated and admin routes and MySQL (AWS RDS) for user data.

For the full endpoint reference and database schema, see the
[root CONTRIBUTING.md](../../CONTRIBUTING.md#api-endpoints).

## Layout

- `src/handlers/` — Lambda handlers (~32 files backing ~39 functions; some
  files, like `admin.js`, back several function resources)
- `src/lib/` — shared helpers (DB access via `serverless-mysql`, the wallet
  `ranker/`, auth, etc.)
- `template.yml` — SAM/CloudFormation template defining every function, the
  API, schedules, and IAM
- `migrations/` — numbered, single-statement SQL migrations
- `events/` — sample invocation events for `sam local invoke`

## Prerequisites

- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
- Node.js 22+
- Docker (only needed for `sam local`)

## Build & deploy

Deploys normally run through GitHub Actions (`.github/workflows/deploy-api.yml`):
any push to `main` touching `apps/api/**` runs `sam build && sam deploy` via
GitHub OIDC. There's also a `workflow_dispatch` button for manual runs.

To deploy by hand from a machine that already has `samconfig.toml`
(gitignored — holds the stack name, bucket, and params):

```bash
sam build
sam deploy
```

The stack reuses its existing `NoEcho` parameters (DB credentials,
`IpHashPepper`, `GooglePlacesApiKey`) automatically. A brand-new machine's
first deploy needs them passed via `--parameter-overrides`; the stack
remembers them afterward.

## Local testing

Each `test-*` script in `package.json` invokes one handler against a sample
event with `sam local invoke` (requires Docker):

```bash
npm run test-get-all-cards
npm run test-get-card-by-id
npm run test-post-record
# ...see package.json for the full list
```

Add new sample events under `events/` and a matching `test-*` script to cover
more handlers.

## Migrations

The database lives in a private VPC and can't be reached from a local machine.
To run a migration, wire `RunMigrationHandler` into `template.yml`, deploy,
invoke it, then unwire it again. Migration files must be **single-statement**;
split multi-step changes into `NNNa_*`, `NNNb_*`. See
[apps/api/migrations/](./migrations/) for the numbered history.
