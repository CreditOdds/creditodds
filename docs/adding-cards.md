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
category: "travel"
annual_fee: 95
```

#### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Official card name | `"Chase Sapphire Preferred Card"` |
| `bank` | string | Issuing bank | `"Chase"` |
| `slug` | string | URL identifier (must match filename) | `"chase-sapphire-preferred"` |
| `accepting_applications` | boolean | Is card currently available? | `true` |

#### Optional Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `image` | string | Image filename | `"chase-sapphire-preferred.png"` |
| `category` | string | Card category | `"travel"` |
| `annual_fee` | number | Annual fee in USD | `95` |

#### Valid Categories

- `travel` - Travel rewards cards
- `cashback` - Cash back cards
- `business` - Business credit cards
- `student` - Student credit cards
- `secured` - Secured credit cards
- `rewards` - General rewards cards
- `other` - Other card types

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

Found 77 card file(s)

Processing: your-card-name.yaml
  OK: Your Card Full Name

---

Successfully built 77 card(s) to data/cards.json
```

If there are errors, fix them before proceeding.

### Step 7: Commit Your Changes

```bash
# Add your files
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
name: "Capital One Venture X Rewards Credit Card"
bank: "Capital One"
slug: "capital-one-venture-x"
image: "capital-one-venture-x.png"
accepting_applications: true
category: "travel"
annual_fee: 395
```

**File: `data/cards/images/capital-one-venture-x.png`**
(Card image file)

**Commit message:**
```
Add Capital One Venture X Rewards Credit Card
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
