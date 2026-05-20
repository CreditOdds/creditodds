# How to Add a Credit Card to CreditOdds

This guide walks you through the process of adding a new credit card to CreditOdds via a GitHub Pull Request.

## Overview

Credit card data is stored as YAML files in the repository. When your PR is merged:
1. A GitHub Action automatically builds the card database
2. Card images are uploaded to our CDN
3. The new card appears on the website within minutes

## Step-by-Step Guide

### Step 1: Fork the Repository

1. Go to [github.com/CreditOdds/creditodds](https://github.com/CreditOdds/creditodds)
2. Click the **Fork** button in the top right
3. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/creditodds.git
   cd creditodds
   ```

### Step 2: Create a Branch

```bash
git checkout -b add-my-new-card
```

### Step 3: Create the Card YAML File

Create a new file in `data/cards/` with a URL-friendly name:

```bash
touch data/cards/your-card-name.yaml
```

**Naming Rules:**
- Use lowercase letters only
- Use hyphens instead of spaces
- No special characters
- Match the card name closely

**Examples:**
- `chase-sapphire-preferred.yaml`
- `amex-platinum.yaml`
- `discover-it-cash-back.yaml`

### Step 4: Add Card Information

Edit your YAML file with the card details:

```yaml
name: "Your Card Full Name"
bank: "Issuing Bank"
slug: "your-card-name"
image: "your-card-name.png"
accepting_applications: true
category: "cashback"
annual_fee: 0
tags:
  - cashback
reward_type: "cashback"
rewards:
  - category: dining
    value: 3
    unit: percent
  - category: groceries
    value: 3
    unit: percent
  - category: everything_else
    value: 1
    unit: percent
signup_bonus:
  value: 200
  type: cash
  spend_requirement: 500
  timeframe_months: 3
```

**Naming Convention:** Card names should NOT include "Card" or "Credit Card" as a suffix. For example, use "Chase Sapphire Preferred" instead of "Chase Sapphire Preferred Card".

#### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Official card name (omit "Card"/"Credit Card" suffix) | `"Chase Sapphire Preferred"` |
| `bank` | string | Issuing bank | `"Chase"` |
| `slug` | string | URL identifier (must match filename) | `"chase-sapphire-preferred"` |
| `accepting_applications` | boolean | Is card currently available? | `true` |

#### Optional Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `image` | string | Image filename | `"chase-sapphire-preferred.png"` |
| `category` | string | Card category (see Valid Categories below) | `"travel"` |
| `annual_fee` | number | Annual fee in USD | `95` |
| `annual_fee_intro` | object | Promotional first-N-months fee: `{ value, months }` | `{ value: 0, months: 12 }` |
| `foreign_transaction_fee` | boolean | `true` if the card charges a foreign transaction fee, `false` if not. Omit if unknown. | `false` |
| `release_date` | string | Card release date in `YYYY-MM-DD` format | `"2025-03-01"` |
| `tags` | array | Tags for filtering (see Valid Tags below) | `["travel", "dining"]` |
| `apply_link` | string (URL) | Direct application URL | `"https://..."` |
| `card_referral_link` | string (URL) | Base URL for the issuer's referral program | `"https://..."` |
| `previous_names` | array | Prior names for rebranded cards (rendered on the card page) | `["Old Card Name"]` |
| `our_take` | string | Editorial paragraph shown in the "Our take" block | `"..."` |
| `reward_type` | string | Type of rewards: `cashback`, `points`, or `miles` | `"points"` |
| `rewards` | array | Reward rates by spend category (see Rewards below) | See example |
| `signup_bonus` | object | Welcome bonus details (see Signup Bonus below) | See example |
| `benefits` | array | Card perks, credits, and protections (see Benefits below) | See example |
| `apr` | object | Intro and regular APR details (see APR below) | See example |

#### Valid Categories

- `travel` - Travel rewards cards
- `cashback` - Cash back cards
- `business` - Business credit cards
- `student` - Student credit cards
- `secured` - Secured credit cards
- `rewards` - General rewards cards
- `balance_transfer` - Balance transfer cards
- `other` - Other card types

#### Valid Tags

Tags allow a card to appear in multiple filter categories:

`travel`, `cashback`, `hotel`, `shopping`, `student`, `secured`, `premium`, `business`, `rewards`, `airline`, `dining`, `entertainment`, `balance_transfer`, `credit_builder`

#### Rewards

If the card earns rewards, specify the `reward_type` and `rewards` array. Each reward entry needs a `category` (from `data/categories.yaml`), a `value`, and a `unit` (`percent` or `points_per_dollar`):

```yaml
reward_type: "points"
rewards:
  - category: dining
    value: 3
    unit: points_per_dollar
  - category: travel
    value: 2
    unit: points_per_dollar
  - category: everything_else
    value: 1
    unit: points_per_dollar
```

Each reward entry can also carry advanced fields for rotating, choose-your-own, or capped categories:

- `note` - extra context shown alongside the rate
- `mode` - `quarterly_rotating`, `user_choice`, or `auto_top_spend`
- `eligible_categories` / `choices` - the category pool and pick count for `user_choice` cards
- `current_categories` / `current_period` - the live categories for `quarterly_rotating` cards (e.g. `Q2 2026`)
- `spend_cap` / `cap_period` / `rate_after_cap` - for categories that earn the headline rate only up to a spend limit
- `merchant_specific` - `true` when the bonus is gated to specific merchants described in `note`

See [`data/cards/schema.json`](../data/cards/schema.json) for the full field reference.

#### Signup Bonus

When `signup_bonus` is present, all four fields below are required. Add an optional `note` for offer caveats, such as an elevated limited-time offer or a portal-valuation figure.

```yaml
signup_bonus:
  value: 60000
  type: points        # cash, points, or miles
  spend_requirement: 4000
  timeframe_months: 3
  note: "Plus a $100 statement credit"   # optional
```

#### Benefits

Card perks, credits, and protections. Each entry needs a `name` and `description`; the other fields are optional:

```yaml
benefits:
  - name: "Annual Travel Credit"
    description: "Statement credit for travel booked through the issuer portal"
    value: 300
    frequency: "annual"      # annual, monthly, ongoing, one_time, per_trip, multi_year, ...
    category: "travel"
    enrollment_required: false
```

`value` is the dollar value of the perk. Use `0` for non-monetary perks like lounge access or elite status. For `multi_year` perks, add `frequency_years` (e.g. `5` for a Global Entry credit).

#### APR

Intro and ongoing interest rates. Every sub-object is optional:

```yaml
apr:
  purchase_intro:
    rate: 0
    months: 15
  balance_transfer_intro:
    rate: 0
    months: 15
  regular:
    min: 19.49
    max: 28.49
```

#### Editorial Take

`our_take` is an optional editorial paragraph. When set, it renders in the "Our take" block on the card detail page; when omitted, that block is hidden.

```yaml
our_take: "A strong everyday card if you can use the travel credits, but the annual fee makes it a poor fit for occasional travelers."
```

Keep it to a sentence or two of honest, balanced assessment. Avoid em dashes in this copy.

### Step 5: Add a Card Image (Recommended)

Adding an image helps users identify the card visually.

#### Image Requirements

| Requirement | Specification |
|-------------|---------------|
| Format | PNG or JPG |
| Dimensions | ~400x250 pixels (standard card ratio) |
| File size | Under 500KB |
| Filename | Must match slug (e.g., `your-card-name.png`) |

#### Adding the Image

1. Save your image to `data/cards/images/`:
   ```
   data/cards/images/your-card-name.png
   ```

2. Reference it in your YAML file:
   ```yaml
   image: "your-card-name.png"
   ```

#### Where to Find Card Images

- Official bank websites
- Card comparison sites
- Search "[card name] credit card image"

**Note:** Only use images you have rights to use or that are publicly available for informational purposes.

### Step 6: Validate Your Changes

Install dependencies (if you haven't):
```bash
npm install
```

Run the validation:
```bash
npm run build:cards
```

You should see output like:
```
Building cards.json from YAML files...

Found 166 card file(s)

Processing: your-card-name.yaml
  OK: Your Card Full Name

---

Successfully built 166 card(s) to data/cards.json
```

If there are errors, fix them before proceeding.

**Important:** Do NOT manually edit `data/cards.json` — it is auto-generated by `build:cards`. Only edit YAML files.

### Step 7: Commit Your Changes

```bash
# Add your files (only YAML and image — do NOT commit cards.json)
git add data/cards/your-card-name.yaml
git add data/cards/images/your-card-name.png  # if you added an image

# Commit
git commit -m "Add Your Card Name"
```

### Step 8: Push and Create PR

```bash
git push origin add-my-new-card
```

Then go to GitHub and create a Pull Request:

1. Go to your fork on GitHub
2. Click **"Compare & pull request"**
3. Fill in the PR template
4. Click **"Create pull request"**

## Example: Complete Card Submission

Here's a complete example of adding the Capital One Venture X card:

**File: `data/cards/capital-one-venture-x.yaml`**
```yaml
name: "Capital One Venture X Rewards"
bank: "Capital One"
slug: "capital-one-venture-x"
image: "capital-one-venture-x.png"
accepting_applications: true
category: "travel"
annual_fee: 395
tags:
  - travel
  - premium
  - rewards
reward_type: "miles"
rewards:
  - category: hotels_car_portal
    value: 10
    unit: points_per_dollar
  - category: flights_portal
    value: 5
    unit: points_per_dollar
  - category: everything_else
    value: 2
    unit: points_per_dollar
signup_bonus:
  value: 75000
  type: miles
  spend_requirement: 4000
  timeframe_months: 3
```

**File: `data/cards/images/capital-one-venture-x.png`**
(Card image file)

**Commit message:**
```
Add Capital One Venture X Rewards
```

## Common Issues

### "Invalid slug format"
- Slug must be lowercase
- Use hyphens, not underscores
- No spaces or special characters

### "Missing required field"
- Make sure you have `name`, `bank`, `slug`, and `accepting_applications`

### "Slug doesn't match filename"
- The `slug` value must exactly match the filename (without `.yaml`)
- `capital-one-venture-x.yaml` → `slug: "capital-one-venture-x"`

### Image not showing
- Make sure the `image` field matches the exact filename
- Image must be in `data/cards/images/` directory
- Check file extension matches (`.png` vs `.jpg`)

## After Your PR is Merged

Once a maintainer reviews and merges your PR:

1. GitHub Action automatically runs (~2 minutes)
2. Card data is uploaded to our CDN
3. Card image is uploaded to our CDN
4. The card appears on [creditodds.com](https://creditodds.com)

## Questions?

- Open a [GitHub Issue](https://github.com/CreditOdds/creditodds/issues)
- Contact us at [creditodds.com/contact](https://creditodds.com/contact)

Thank you for contributing to CreditOdds!
