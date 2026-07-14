# CreditOdds

CreditOdds is a platform that helps users understand their credit card approval odds based on real user-submitted data points, track the cards in their wallet, and find the best card for any purchase.

## Project Structure

This is a monorepo containing all CreditOdds applications and shared code:

```
creditodds/
├── apps/
│   ├── api/                 # AWS SAM serverless API (Lambda, Node.js 22)
│   ├── functions/           # Firebase Cloud Functions (new-signup Slack notification)
│   ├── ios/                 # Native iOS app (SwiftUI, XcodeGen)
│   └── web-next/            # Next.js 16 frontend application
├── packages/
│   └── shared/              # Shared utilities and validation schemas
├── data/                    # Content source of truth (YAML/Markdown → built JSON)
│   ├── articles/            # Long-form article content (+ drafts/ for scheduled posts)
│   ├── best/                # "Best cards" category pages
│   ├── cards/               # Credit card definitions (one YAML per card)
│   │   └── images/          # Card images for PR submissions
│   ├── news/                # News articles
│   ├── social-pages/        # Social page metadata
│   ├── stores/              # Store / merchant data for best-card-for pages
│   └── valuations/          # Points & miles valuation history
├── docs/                    # Project documentation (e.g. adding-cards.md)
├── infra/                   # Standalone CloudFormation (VPC / networking)
├── scripts/                 # Build, content-automation, QA, and social scripts
└── .github/
    └── workflows/           # GitHub Actions for CI/CD and automation
```

## Tech Stack

### Frontend (`apps/web-next`)
- Next.js 16 with App Router, built with Turbopack
- TypeScript, Tailwind CSS
- Highcharts for data visualization (code-split, client-only)
- Firebase Authentication (Google Sign-in, Email Magic Links)
- SSR/SSG with ISR (most pages revalidate every 5 minutes)
- Sentry error monitoring, PostHog analytics (proxied through `relay.creditodds.com`), Web Vitals reporting
- Security headers (HSTS, X-Frame-Options, Permissions-Policy) plus a report-only CSP
- SEO: per-page JSON-LD, ~40 OpenGraph image routes, sitemap + Google News sitemap, a prebuild SEO gate (`scripts/check-seo.mjs`)
- Tests with Vitest; ESLint with zero-warning policy
- Deployed on AWS Amplify

### Backend (`apps/api`)
- AWS SAM stack (`CreditCardOddsAPI`) with ~39 Lambda functions (Node.js 22, esbuild-bundled)
- AWS API Gateway with a Firebase token authorizer as the default; public read/analytics routes explicitly opt out
- All functions run inside a private VPC; outbound traffic exits through a single NAT gateway whose Elastic IP is allowlisted by the database security group
- MySQL (AWS RDS) via a shared `serverless-mysql` connection module (`src/db.js`)
- Sentry Lambda layer attached to every function
- One scheduled function: card stats refresh every 5 minutes (EventBridge)
- Wallet "best card" ranking engine in `apps/api/src/lib/ranker/` (shared with the frontend via the `@ranker` alias)
- Sequential single-statement SQL migrations in `apps/api/migrations/`

### Other apps
- **iOS** (`apps/ios`): native SwiftUI app (Wallet / Earn / Settings tabs, card browsing), Firebase Auth, talks to the same API
- **Firebase Cloud Functions** (`apps/functions`): a single `onUserCreated` trigger that posts new-signup notifications to Slack

### Infrastructure
- **Content data**: YAML/Markdown in `data/` → build scripts → JSON → S3 → CloudFront CDN
- **Card images**: GitHub → S3 → CloudFront CDN
- **User data**: AWS RDS MySQL (private VPC; not reachable from local machines)
- **Authentication**: Firebase (Google, Email Link)
- **CI/CD & automation**: GitHub Actions (OIDC to AWS, no long-lived keys)
- **Networking**: `infra/network.yml` defines the VPC, private subnets, single NAT gateway with a static egress IP, and an S3 gateway endpoint

### Region split (deliberate)
- **Lambdas / API stack**: us-east-1 (co-located with the database)
- **Content S3 buckets + CloudFront**: us-east-2 (never migrated; workflows default to us-east-2 and pass `--region us-east-1` explicitly for Lambda invokes)

## Getting Started

### Prerequisites

- Node.js 22+
- npm 9+
- AWS CLI and AWS SAM CLI (only for API deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/CreditOdds/creditodds.git
cd creditodds

# Install dependencies (installs all workspaces)
npm install
```

### Environment Setup

Create a `.env.local` file in `apps/web-next/`:

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-api-gateway-url.amazonaws.com/Prod
NEXT_PUBLIC_CDN_URL=https://your-cloudfront-url.cloudfront.net

# Firebase Auth
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

In development the app reads `data/cards.json` and `data/news.json` from the local checkout instead of the CDN, so run the build scripts below at least once.

### Running Locally

**Start the Next.js application:**
```bash
npm run start:web-next
# or
cd apps/web-next && npm run dev
```

**Build the card data:**
```bash
npm run build:cards
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run start:web-next` | Start the Next.js development server |
| `npm run dev:web-next` | Start the Next.js development server (alias) |
| `npm run build:web-next` | Build the Next.js app for production |
| `npm run build:cards` | Build cards.json from YAML files |
| `npm run build:news` | Build news.json from Markdown/YAML files |
| `npm run build:articles` | Build articles.json from Markdown/YAML files |
| `npm run build:best` | Build best.json from Markdown/YAML files |
| `npm run build:stores` | Build stores.json from YAML files (also mirrored into the API bundle) |
| `npm run sync:news-images` | Generate/sync news hero images |
| `npm run lint` | Run ESLint across all workspaces |

> **Tests:** the web app uses Vitest (`cd apps/web-next && npm test`). The API
> has per-handler smoke tests run with SAM (`cd apps/api && npm run test-*`,
> e.g. `npm run test-get-all-cards`).

## Key Features

- **Explore Cards**: Browse all credit cards with search and filter by bank
- **Bank Pages**: View all cards from a specific bank
- **Card Details**: See approval odds with interactive charts
- **Card Wire**: Live feed of card changes — annual fees, sign-up bonuses, reward rates, APR
- **Card News**: Curated news and updates about credit cards
- **Articles**: Long-form guides and analysis
- **Best Cards**: Ranked lists by category (multi-model consensus ranking)
- **Best Card For**: Best card to use at ~900 specific stores/merchants, including statement credits
- **Best Card For Me**: Personalized next-card quiz ranked by marginal wallet value
- **Check Odds**: Estimate your approval odds for a specific card
- **Compare**: Side-by-side credit card comparisons
- **Card Ratings**: User-submitted 1-5 star ratings on cards
- **User Submissions**: Submit your credit card application results
- **Wallet**: Track cards you own, with best-card picks for stores and nearby places
- **Referral Links**: Share and earn from referral links (with automated daily validity checks)
- **Rewards Tools**: 13 points/miles-to-USD converters (Chase UR, Amex MR, Capital One, airline & hotel programs)

## Contributing

We welcome contributions! The easiest way to contribute is by adding new credit cards to our database.

**See [CONTRIBUTING.md](./CONTRIBUTING.md) and [docs/adding-cards.md](./docs/adding-cards.md) for detailed instructions on:**
- Adding new credit cards
- Submitting card images
- Code contributions

## Deployment

### API Deployment

Pushes to `main` touching `apps/api/**` deploy automatically via GitHub Actions
(`deploy-api.yml`: `sam build && sam deploy`, authenticated with GitHub OIDC).
Manual deploy still works from a machine with `samconfig.toml`:

```bash
cd apps/api
sam build
sam deploy
```

### Web Deployment

The Next.js app builds on AWS Amplify. Amplify's native auto-build is disabled;
each merge to `main` fires the Amplify webhook exactly once — code pushes via
`deploy-frontend.yml`, data pushes via the relevant `build-*.yml` workflow.

### Content Data Deployment

Content changes merged to `main` trigger the matching workflow:

1. GitHub Action triggers on changes to `data/<type>/**`
2. Builds the JSON artifact from YAML/Markdown sources
3. Uploads to S3 and invalidates CloudFront
4. Triggers the Amplify webhook (and, for cards, syncs the database via the `creditodds-sync-cards` Lambda)

### Database Migrations

Migrations live in `apps/api/migrations/`, numbered sequentially and
single-statement only (multi-step changes split into `NNNa_*`, `NNNb_*`).
The database is inside a private VPC, so migrations run by temporarily wiring
`RunMigrationHandler` into `template.yml`, deploying, invoking, and unwiring
(see `apps/api/README.md`).

## Automation (GitHub Actions)

Beyond builds and deploys, the repo runs a substantial automation layer —
all human-in-the-loop (content changes land as PRs or issues for review):

| Category | Workflows |
|----------|-----------|
| Deploys | `deploy-api`, `deploy-frontend` |
| Data builds | `build-cards`, `build-news`, `build-articles`, `build-best` |
| Content automation | `auto-news` (2x daily news discovery → PR), `content-agent` (hourly competitor watch), `publish-scheduled-articles` (daily), `refresh-best-pages` (twice monthly LLM re-rank → PR), `bump-best-updated-at`, `reject-news` |
| Data quality | `check-card-pages` (daily scrape/verify → PR), `check-card-rewards-and-benefits` (weekly → PR), `check-apply-links` (daily → issue), `check-referrals` (daily validation) |
| Social | `queue-social`, `post-best-rankings`, `post-card-wire-manual`, `reconcile-card-wire` (every 30 min), `weekly-sub-changes`, `weekly-top-cards` |

AWS access from workflows uses GitHub OIDC roles (no stored AWS keys).
LLM-powered scripts use OpenAI (plus xAI Grok for X/Twitter search in news discovery).

## Monitoring

- **Sentry**: frontend (`@sentry/nextjs`, tunneled through `/monitoring`) and every backend Lambda (Sentry Lambda layer)
- **PostHog**: product analytics, proxied through the managed `relay.creditodds.com` reverse proxy
- **Web Vitals**: reported from the root layout

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│   GitHub Repo   │────▶│  GitHub Actions   │────▶│    S3 + CloudFront   │
│ (YAML/MD/Images)│     │ (build + upload,  │     │ cards/news/articles/ │
└─────────────────┘     │  OIDC to AWS)     │     │ best/stores JSON     │
                        └────────┬─────────┘     └──────────┬───────────┘
                                 │ sync-cards Lambda        │
                                 ▼                          │
┌─────────────────┐     ┌──────────────────┐                │
│  Next.js App    │────▶│  API Gateway +    │◀───────────────┘
│  (AWS Amplify)  │     │  Lambda (SAM,     │
│  + iOS app      │     │  Firebase auth,   │
└────────┬────────┘     │  private VPC)     │
         │              └────────┬─────────┘
         │                       │ NAT (static EIP)
         │              ┌────────▼─────────┐
         └─────────────▶│   MySQL (RDS)    │
          (API calls)   │  (user records,  │
                        │  stats, ratings) │
                        └──────────────────┘

┌──────────────────┐    ┌───────────────────────┐
│ Firebase Auth +  │    │ Social Posting Service │
│ Cloud Functions  │    │ (separate repo/stack)  │
│ (signup → Slack) │    └───────────────────────┘
└──────────────────┘
```
