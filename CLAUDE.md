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

## Database

- MySQL database hosted on AWS
- Migrations in `apps/api/migrations/`
- Run migrations with `node scripts/run-migration.js <migration-file>`
