# CreditOdds

CreditOdds is a platform that helps users understand their credit card approval odds based on real user-submitted data points.

## Project Structure

This is a monorepo containing all CreditOdds applications and shared code:

```
creditodds/
├── apps/
│   ├── api/                 # AWS Lambda serverless API
│   └── web/                 # React frontend application
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

### Frontend (`apps/web`)
- React 18
- Tailwind CSS
- React Router
- Highcharts for data visualization
- AWS Cognito for authentication

### Backend (`apps/api`)
- AWS Lambda (Node.js 18)
- AWS API Gateway
- AWS SAM for infrastructure
- MySQL (AWS RDS) for user records

### Infrastructure
- **Card Data**: GitHub → S3 → CloudFront CDN
- **Card Images**: GitHub → S3 → CloudFront CDN
- **User Data**: AWS RDS MySQL
- **Authentication**: AWS Cognito
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

### Running Locally

**Start the web application:**
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
| `npm run start:web` | Start the React development server |
| `npm run build:web` | Build the React app for production |
| `npm run build:cards` | Build cards.json from YAML files |
| `npm run test:web` | Run web app tests |
| `npm run test:api` | Run API tests |

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

The web app is deployed via AWS CodePipeline (configured separately).

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   GitHub Repo   │────▶│   GitHub Action │────▶│   S3 + CloudFront│
│  (YAML + Images)│     │   (Build/Upload)│     │   (cards.json)  │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
┌─────────────────┐     ┌─────────────────┐              │
│  React Frontend │────▶│  Lambda API     │◀─────────────┘
│                 │     │                 │
└─────────────────┘     └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │   MySQL (RDS)   │
                        │ (User Records)  │
                        └─────────────────┘
```

## License

Proprietary - All rights reserved.

## Contact

For questions or support, visit [creditodds.com/contact](https://creditodds.com/contact).
