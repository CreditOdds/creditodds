# CreditOdds Web (Next.js)

The CreditOdds frontend: a [Next.js 16](https://nextjs.org) App Router app in
TypeScript, styled with Tailwind CSS and the editorial "v2" design system
(Inter Tight headlines, Inter body). It uses SSR/SSG with ISR for SEO, Firebase
Authentication (Google sign-in + email magic links), and Highcharts for the
approval-odds visualizations. It's deployed on AWS Amplify.

## Getting started

From the repo root, `npm install` once (it installs every workspace), then:

```bash
npm run dev          # from apps/web-next
# or, from the repo root:
npm run start:web-next
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

Create `.env.local` in this directory (see the
[root README](../../README.md#environment-setup) for the full list):

```bash
NEXT_PUBLIC_API_BASE_URL=...
NEXT_PUBLIC_CDN_URL=...
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (runs the SEO check first via `prebuild`) |
| `npm start` | Serve the production build |
| `npm test` | Run the Vitest suite |
| `npm run lint` | ESLint (`--max-warnings=0`) |
| `npm run check:seo` | Run the SEO check (`scripts/check-seo.mjs`) on its own |
| `npm run analyze` | Build with the bundle analyzer |

> The `prebuild` SEO check fails the build on issues like an empty `alt`
> attribute, so always give images a real `alt`.

## Deployment

Pushed to `main` and deployed via AWS Amplify. Native auto-build is disabled
(`enableAutoBuild=false`); each merge fires the build webhook exactly once
through `.github/workflows/deploy-frontend.yml` (code) or the relevant
`build-*.yml` workflow (data). See the
[root README](../../README.md#deployment) for details.
