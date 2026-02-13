# Contributing to CreditOdds

Thank you for your interest in contributing to CreditOdds!

## Ways to Contribute

### Add a Credit Card

The easiest way to contribute is by adding new credit cards to our database.

**[See the complete guide →](./docs/adding-cards.md)**

**Quick Start:**

1. Fork the repository
2. Create a YAML file in `data/cards/your-card-name.yaml`:
   ```yaml
   name: "Your Card Name"
   bank: "Bank Name"
   slug: "your-card-name"
   image: "your-card-name.png"  # optional
   accepting_applications: true
   category: "travel"  # optional
   annual_fee: 95  # optional
   ```
3. (Optional) Add card image to `data/cards/images/your-card-name.png`
4. Run `npm run build:cards` to validate
5. Submit a Pull Request

### Report Issues

Found a bug or have a suggestion? [Open an issue](https://github.com/CreditOdds/creditodds/issues).

### Code Contributions

For code changes:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run tests: `npm run test:web`
5. Submit a Pull Request

## Development Setup

```bash
# Clone and install
git clone https://github.com/CreditOdds/creditodds.git
cd creditodds
npm install

# Run the web app
npm run start:web

# Build card data
npm run build:cards
```

## Project Structure

```
creditodds/
├── apps/
│   ├── api/          # Lambda API
│   ├── shared/       # Shared code
│   └── web-next/     # Next.js frontend
├── data/
│   └── cards/        # Card YAML files
│       └── images/   # Card images
└── docs/             # Documentation
```

## Database Schema

The MySQL database stores user submissions, referral links, and card metadata synced from the CDN.

### Core Tables

#### `cards`

Master card data, synced from the CDN via `update-cards-github.js`.

| Column | Type | Description |
|--------|------|-------------|
| `card_id` | INT (PK, auto-increment) | Numeric card identifier |
| `card_name` | VARCHAR | Card name (e.g., "American Express Gold") |
| `bank` | VARCHAR | Issuing bank |
| `card_image_link` | VARCHAR | CDN image URL |
| `accepting_applications` | BOOLEAN | Whether the card is currently available |
| `apply_link` | VARCHAR | Direct application URL (optional) |
| `card_referral_link` | VARCHAR | Official referral program link |
| `slug` | VARCHAR | URL-safe identifier |
| `tags` | JSON | Card categories/tags |

> **Note:** The CDN uses `slug` as `card_id`, but the database uses a numeric auto-increment `card_id`. The `card-by-id.js` handler maps between the two.

#### `records`

User-submitted credit card application results.

| Column | Type | Description |
|--------|------|-------------|
| `record_id` | INT (PK) | Record identifier |
| `card_id` | INT (FK) | References `cards.card_id` |
| `submitter_id` | VARCHAR | Firebase UID |
| `credit_score` | INT | 300–850 |
| `credit_score_source` | INT | 0=Equifax, 1=Experian, 2=TransUnion, 3=other, 4=unknown |
| `result` | BOOLEAN | 1=approved, 0=denied |
| `listed_income` | INT | Annual income |
| `length_credit` | INT | Years of credit history |
| `starting_credit_limit` | INT | Credit limit if approved |
| `reason_denied` | VARCHAR | Denial reason if denied |
| `date_applied` | DATE | When the user applied |
| `bank_customer` | BOOLEAN | Existing bank relationship |
| `inquiries_3` | INT | Hard inquiries in last 3 months |
| `inquiries_12` | INT | Hard inquiries in last 12 months |
| `inquiries_24` | INT | Hard inquiries in last 24 months |
| `submitter_ip_address` | VARCHAR | IP address |
| `submit_datetime` | TIMESTAMP | Submission timestamp |
| `admin_review` | BOOLEAN | Approved for public display |
| `active` | BOOLEAN | Soft-delete flag |

#### `referrals`

User-submitted referral links.

| Column | Type | Description |
|--------|------|-------------|
| `referral_id` | INT (PK) | Referral identifier |
| `card_id` | INT (FK) | References `cards.card_id` |
| `referral_link` | VARCHAR | User's referral URL |
| `submitter_id` | VARCHAR | Firebase UID |
| `submitter_ip_address` | VARCHAR | IP address |
| `submit_datetime` | TIMESTAMP | Submission timestamp |
| `admin_approved` | BOOLEAN | 0=pending, 1=approved |

#### `referral_stats`

Tracks impressions and clicks on referral links.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Stat entry identifier |
| `referral_id` | INT (FK) | References `referrals.referral_id` |
| `event_type` | ENUM | `'impression'` or `'click'` |
| `ip_address` | VARCHAR | Visitor IP |
| `user_agent` | VARCHAR | Browser user agent |
| `created_at` | TIMESTAMP | Event timestamp |

#### `user_cards`

User wallet — tracks which cards a user owns.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Entry identifier |
| `user_id` | VARCHAR | Firebase UID |
| `card_id` | INT (FK) | References `cards.card_id` |
| `acquired_month` | TINYINT | 1–12 (optional) |
| `acquired_year` | SMALLINT | e.g., 2024 (optional) |
| `created_at` | TIMESTAMP | When the entry was added |

#### `audit_log`

Tracks admin actions for accountability.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Log entry identifier |
| `admin_id` | VARCHAR | Admin Firebase UID |
| `action` | VARCHAR | Action performed |
| `entity_type` | VARCHAR | Table/resource affected |
| `entity_id` | INT | ID of affected row |
| `details` | JSON | Additional context |
| `created_at` | TIMESTAMP | Action timestamp |

### Data Flow

```
YAML files (data/cards/) → build-cards.js → cards.json → S3/CloudFront CDN
                                                              ↓
                                           update-cards-github.js syncs to MySQL
                                                              ↓
                                           API merges CDN data + DB stats → Frontend
```

## API Endpoints

All endpoints are served via AWS API Gateway + Lambda. Base path: `/Prod`.

### Authentication

Most endpoints require a Firebase auth token in the `Authorization: Bearer {token}` header. Admin endpoints additionally check for an `admin: 'true'` custom claim.

### Public Endpoints

#### `GET /cards` — List All Cards

Returns all cards with approval stats. Used by the explore page and landing page search.

**Response:** Array of card objects with `card_id` (slug), `db_card_id` (numeric), `name`, `bank`, `image`, `total_records`, `approved_count`, `rejected_count`, `tags`, etc.

#### `GET /card?card_name={name}` — Card Details

Detailed card info with median stats and referral links. Supports exact name match, slug match, or fuzzy "Card" suffix fallback.

**Response:** Card object with `card_id` (numeric), approval/denial counts, `approved_median_credit_score`, `approved_median_income`, `approved_median_length_credit`, `referrals` array, etc.

#### `GET /graphs?card_id={id}` — Card Graph Data

Chart data for approval odds visualization (credit score distributions).

#### `GET /leaderboard?limit={n}` — Top Contributors

Leaderboard of top data contributors by submission count. Default limit: 25, max: 100.

**Response:** `{ leaderboard: [...], stats: { total_records, total_contributors, ... } }`

#### `GET /recent-records` — Recent Submissions

Most recent approved records for the homepage ticker.

#### `POST /referral-stats` — Track Referral Event

Logs an impression or click on a referral link.

**Body:** `{ "referral_id": 1, "event_type": "impression" | "click" }`

### Authenticated Endpoints

#### `GET /records` — User's Records

Returns the authenticated user's submitted application records.

#### `POST /records` — Submit a Record

Submit a credit card application result.

**Body:**
```json
{
  "card_id": 42,
  "credit_score": 750,
  "credit_score_source": 0,
  "result": true,
  "listed_income": 95000,
  "length_credit": 12,
  "starting_credit_limit": 10000,
  "reason_denied": null,
  "date_applied": "2024-01-10",
  "bank_customer": true,
  "inquiries_3": 2,
  "inquiries_12": 5,
  "inquiries_24": 8
}
```

**Validation:** credit_score 300–850, income 0–1M, max 5 records per card per user, duplicate detection.

#### `DELETE /records?record_id={id}` — Delete Record

Soft-deletes the user's own record.

#### `GET /referrals` — User's Referrals

Returns the user's submitted referral links with impression/click stats.

#### `POST /referrals` — Submit Referral Link

**Body:** `{ "card_id": 42, "referral_link": "https://..." }`

One referral per card per user. Link must be unique across all users.

#### `DELETE /referrals?referral_id={id}` — Delete Referral

Deletes the user's referral and its associated stats.

#### `GET /wallet` — User's Wallet

Returns cards the user owns with acquisition dates.

#### `POST /wallet` — Add Card to Wallet

**Body:** `{ "card_id": 42, "acquired_month": 5, "acquired_year": 2024 }`

#### `DELETE /wallet` — Remove Card from Wallet

**Body:** `{ "card_id": 42 }`

#### `GET /profile` — User Profile

Returns the authenticated user's profile information.

#### `DELETE /account` — Delete Account

Permanently deletes the user's account. Removes referrals and wallet entries; records are retained for data integrity.

### Admin Endpoints

These require both Firebase auth and an `admin: 'true'` custom claim.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/stats` | Dashboard overview (totals, pending referrals, top cards) |
| `GET` | `/admin/records?limit=&offset=` | Browse all records (paginated) |
| `DELETE` | `/admin/records?record_id={id}` | Hard-delete a record (audited) |
| `GET` | `/admin/referrals?status=` | List referrals (filter: pending/approved) |
| `PUT` | `/admin/referrals` | Approve/update a referral (audited) |
| `DELETE` | `/admin/referrals?referral_id={id}` | Hard-delete a referral (audited) |
| `GET` | `/admin/audit?limit=&offset=` | View audit log |

### Internal Endpoints

#### `POST /sync-cards` — Sync CDN to Database

Triggered by GitHub Actions when card YAML files change. Fetches `cards.json` from CloudFront and upserts into MySQL, matching by `card_name`.

## Questions?

- [Open an issue](https://github.com/CreditOdds/creditodds/issues)
- Visit [creditodds.com/contact](https://creditodds.com/contact)
