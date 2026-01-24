# CreditOdds

CreditOdds is a platform that helps users understand their credit card approval odds based on real user-submitted data points.

## Project Structure

This is a monorepo containing all CreditOdds applications and shared code:

```
creditodds/
├── apps/
│   ├── api/                 # AWS Lambda serverless API
│   ├── web/                 # React frontend application (legacy)
│   └── web-next/            # Next.js 14+ frontend application
├── packages/
│   └── shared/              # Shared utilities and validation schemas
├── data/
│   └── cards/               # Credit card data (YAML files)
│       └── images/          # Card images for PR submissions
├── scripts/                 # Build and utility scripts
└── .github/
    └── workflows/           # GitHub Actions for CI/CD
```

## Tech Stack

### Frontend - Next.js (`apps/web-next`)
- Next.js 14+ with App Router
- TypeScript
- Tailwind CSS
- Highcharts for data visualization
- Firebase Authentication (Google Sign-in, Email Magic Links)
- Server-Side Rendering (SSR) and Static Site Generation (SSG) for SEO

### Frontend - React (`apps/web`) - Legacy
- React 18
- Tailwind CSS
- React Router
- Highcharts for data visualization

### Backend (`apps/api`)
- AWS Lambda (Node.js 18)
- AWS API Gateway with Firebase Token Authorizer
- AWS SAM for infrastructure
- MySQL (AWS RDS) for user records

### Infrastructure
- **Card Data**: GitHub → S3 → CloudFront CDN
- **Card Images**: GitHub → S3 → CloudFront CDN
- **User Data**: AWS RDS MySQL
- **Authentication**: Firebase (Google, Email Link)
- **CI/CD**: GitHub Actions

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- AWS CLI (for API deployment)
- AWS SAM CLI (for API deployment)

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

### Running Locally

**Start the Next.js application:**
```bash
npm run start:web-next
# or
cd apps/web-next && npm run dev
```

**Start the legacy React application:**
```bash
npm run start:web
```

**Build the card data:**
```bash
npm run build:cards
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run start:web-next` | Start the Next.js development server |
| `npm run build:web-next` | Build the Next.js app for production |
| `npm run start:web` | Start the React development server (legacy) |
| `npm run build:web` | Build the React app for production (legacy) |
| `npm run build:cards` | Build cards.json from YAML files |
| `npm run test:web` | Run web app tests |
| `npm run test:api` | Run API tests |

## Key Features

- **Explore Cards**: Browse all credit cards with search and filter by bank
- **Bank Pages**: View all cards from a specific bank
- **Card Details**: See approval odds with interactive charts
- **User Submissions**: Submit your credit card application results
- **Referral Links**: Share and earn from referral links

## Contributing

We welcome contributions! The easiest way to contribute is by adding new credit cards to our database.

**See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed instructions on:**
- Adding new credit cards
- Submitting card images
- Code contributions

## Deployment

### Card Data Deployment

Card data is automatically deployed when changes are merged to `main`:

1. GitHub Action triggers on changes to `data/cards/**`
2. Builds `cards.json` from YAML files
3. Uploads to S3 and invalidates CloudFront cache

### API Deployment

```bash
cd apps/api
sam build
sam deploy
```

### Web Deployment

The Next.js app can be deployed to Vercel or any Node.js hosting platform:

```bash
cd apps/web-next
npm run build
npm run start
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   GitHub Repo   │────▶│   GitHub Action │────▶│   S3 + CloudFront│
│  (YAML + Images)│     │   (Build/Upload)│     │   (cards.json)  │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
┌─────────────────┐     ┌─────────────────┐              │
│  Next.js App    │────▶│  Lambda API     │◀─────────────┘
│  (SSR/SSG)      │     │  + Firebase Auth│
└────────┬────────┘     └────────┬────────┘
         │                       │
         │              ┌────────▼────────┐
         └─────────────▶│   MySQL (RDS)   │
          (API calls)   │ (User Records)  │
                        └─────────────────┘
```

## License

Proprietary - All rights reserved.

## Contact

For questions or support, visit [creditodds.com/contact](https://creditodds.com/contact).
