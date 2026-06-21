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
4. Run tests for the workspace you touched (web: `cd apps/web-next && npm test`; API: `cd apps/api && npm run test-*`, e.g. `npm run test-get-all-cards`)
5. Submit a Pull Request

## Development Setup

```bash
# Clone and install
git clone https://github.com/CreditOdds/creditodds.git
cd creditodds
npm install

# Run the web app
npm run start:web-next

# Build card data
npm run build:cards
```

## Project Structure

```
creditodds/
├── apps/
│   ├── api/          # AWS Lambda API
│   ├── functions/    # Firebase Cloud Functions
│   ├── ios/          # Native iOS app (SwiftUI)
│   └── web-next/     # Next.js frontend
├── packages/
│   └── shared/       # Shared code
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
| `listed_income` | INT (nullable) | Annual income |
| `length_credit` | INT | Years of credit history |
| `starting_credit_limit` | INT | Credit limit if approved |
| `total_open_cards` | SMALLINT UNSIGNED (nullable) | Number of open credit cards |
| `reason_denied` | VARCHAR | Free-text denial reason if denied |
| `reason_denied_code` | VARCHAR(40) | Standardized denial reason code |
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
| `archived_at` | TIMESTAMP (nullable) | Set when the link is archived; stats are preserved |
| `archived_reason` | VARCHAR(255) | Why the referral was archived |

> **Note:** Referral links are archived, never hard-deleted, so submitted URLs are preserved permanently.

#### `referral_stats`

Tracks impressions and clicks on referral links.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Stat entry identifier |
| `referral_id` | INT (FK) | References `referrals.referral_id` |
| `event_type` | ENUM | `'impression'` or `'click'` |
| `ip_address` | VARCHAR | Visitor IP |
| `user_agent` | VARCHAR | Browser user agent |
| `user_id` | VARCHAR(128) (nullable) | Firebase UID of the visitor, if signed in |
| `ip_hash` | CHAR(64) (nullable) | Hashed visitor IP, used for deduplication |
| `created_at` | TIMESTAMP | Event timestamp |

#### `user_cards`

User wallet. Tracks which cards a user owns.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Entry identifier |
| `user_id` | VARCHAR | Firebase UID |
| `card_id` | INT (FK) | References `cards.card_id` |
| `acquired_month` | TINYINT | 1–12 (optional) |
| `acquired_year` | SMALLINT | e.g., 2024 (optional) |
| `sort_order` | INT (nullable) | Manual wallet ordering position |
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

### Supporting Tables

The schema also includes tables for analytics, ratings, and newer features:

| Table | Purpose |
|-------|---------|
| `card_stats` | Precomputed per-card totals and median stats (refreshed on a schedule) |
| `card_ratings` | User-submitted 1–5 star card ratings |
| `card_wire` | Card change events (annual fee, bonus, reward, APR) for the Card Wire feed |
| `card_view_counts` | Per-card page-view tallies |
| `card_apply_clicks` / `card_apply_click_counts` | Apply-link click events and tallies |
| `card_compare_pair_counts` | How often two cards are compared together |
| `approval_searches` | Check-odds search queries |
| `best_card_here_reports` | User reports on store-page card recommendations |
| `user_settings` | Per-user preferences (avatar seed, beta flags, etc.) |
| `user_card_selections` | Selected categories (Cash+, Custom Cash, etc.) per wallet card |
| `user_plaid_items` / `user_plaid_accounts` | Plaid bank connections and linked accounts |

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

Authenticated endpoints require a Firebase auth token in the `Authorization: Bearer {token}` header. Admin endpoints additionally check for an `admin: 'true'` custom claim.

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cards` | List all cards with approval stats (explore + landing search) |
| `GET` | `/card?card_name={name}` | Card detail with median stats and referral links |
| `GET` | `/card-records?card_id={id}` | Approved records for a single card |
| `GET` | `/graphs?card_id={id}` | Chart data for approval-odds visualization |
| `GET` | `/card-wire` | Feed of recent card term changes |
| `GET` | `/ratings?card_id={id}` | Aggregate star rating for a card |
| `GET` | `/leaderboard?limit={n}` | Top contributors by submission count (default 25, max 100) |
| `GET` | `/recent-records` | Most recent approved records for the homepage ticker |
| `GET` `POST` | `/check-odds` | Estimate approval odds for a card |
| `POST` | `/referral-stats` | Log a referral impression or click |
| `GET` `POST` | `/card-view` | Read or increment a card's view count |
| `GET` `POST` | `/card-apply-click` | Read or log an apply-link click |
| `GET` `POST` | `/card-compare-event` | Read or log a card-comparison event |
| `POST` | `/best-card-here-report` | Report an incorrect store-page recommendation |
| `POST` | `/wallet-picks/store` | Best card from a wallet for a given store |
| `POST` | `/wallet-picks/nearby` | Best wallet cards for nearby places |

#### `GET /cards`

Returns all cards with approval stats. **Response:** Array of card objects with `card_id` (slug), `db_card_id` (numeric), `name`, `bank`, `image`, `total_records`, `approved_count`, `rejected_count`, `tags`, etc.

#### `GET /card?card_name={name}`

Detailed card info with median stats and referral links. Supports exact name match, slug match, or fuzzy "Card" suffix fallback. **Response:** Card object with `card_id` (numeric), approval/denial counts, `approved_median_credit_score`, `approved_median_income`, `approved_median_length_credit`, `referrals` array, etc.

### Authenticated Endpoints

Require a valid Firebase auth token.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/records` | The user's submitted application records |
| `POST` | `/records` | Submit a credit card application result |
| `PATCH` | `/records` | Edit one of the user's records |
| `DELETE` | `/records?record_id={id}` | Soft-delete the user's own record |
| `GET` | `/referrals` | The user's referral links with impression/click stats |
| `POST` | `/referrals` | Submit a referral link (one per card per user) |
| `PATCH` | `/referrals` | Edit the user's referral link |
| `DELETE` | `/referrals?referral_id={id}` | Remove the user's referral link |
| `GET` | `/wallet` | Cards in the user's wallet |
| `POST` | `/wallet` | Add a card to the wallet |
| `PUT` | `/wallet/{id}` | Update a wallet entry (e.g. acquisition date) |
| `DELETE` | `/wallet/{id}` | Remove a wallet entry |
| `PUT` | `/wallet/reorder` | Reorder wallet cards |
| `GET` `PUT` `DELETE` | `/wallet/{id}/selections` | Manage selected categories for a wallet card |
| `GET` | `/ratings/me?card_id={id}` | The user's rating for a card |
| `POST` | `/ratings/me` | Submit or update a card rating |
| `GET` `PUT` | `/user-settings` | Read or update the user's profile settings |
| `POST` | `/plaid/link-token` | Create a Plaid Link token |
| `POST` | `/plaid/exchange-token` | Exchange a Plaid public token |
| `GET` | `/plaid/items` | The user's connected Plaid items |
| `DELETE` | `/plaid/items/{id}` | Remove a Plaid connection |
| `DELETE` | `/account` | Permanently delete the user's account and personal data |

#### `POST /records`

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

#### `POST /referrals`

**Body:** `{ "card_id": 42, "referral_link": "https://..." }`

One referral per card per user. Link must be unique across all users.

### Admin Endpoints

Require Firebase auth plus an `admin: 'true'` custom claim. Mutations are recorded in `audit_log`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/stats` | Dashboard overview (totals, pending referrals, top cards) |
| `GET` | `/admin/records` | Browse all records (paginated) |
| `POST` `PUT` | `/admin/records` | Create or edit a record |
| `DELETE` | `/admin/records?record_id={id}` | Hard-delete a record |
| `GET` `PUT` `DELETE` | `/admin/referrals` | List, approve/update, or delete referrals |
| `GET` | `/admin/graphs` | Aggregate graph data for the admin dashboard |
| `GET` | `/admin/searches` | Recent check-odds searches |
| `GET` | `/admin/user` | Look up a user |
| `GET` | `/admin/audit` | View the audit log |
| `POST` | `/admin/refresh-card-stats` | Manually trigger a `card_stats` refresh |

### Internal Endpoints

#### `POST /sync-cards`

Triggered by GitHub Actions when card YAML files change. Fetches `cards.json` from CloudFront and upserts into MySQL, matching by `card_name`.

#### `POST /plaid/webhook`

Receives Plaid webhook events for connected bank items.

## Questions?

- [Open an issue](https://github.com/CreditOdds/creditodds/issues)
- Visit [creditodds.com/contact](https://creditodds.com/contact)
