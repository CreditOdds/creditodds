# Contributing News Updates

Help keep the CreditOdds community informed about credit card news!

## How to Add News

1. Fork the repository
2. Create a new YAML file in `data/news/` with the naming format: `YYYY-MM-DD-short-description.yaml`
3. Fill in the required fields (see template below)
4. Submit a Pull Request

## Short Update vs Full Article

News entries can be either a **short update** (just a summary) or a **full article** (with a body). Both use the same YAML format — the difference is whether you include the `body` field.

### Short Update (no body)

Short updates appear as news cards with just a headline and summary. Use these for quick announcements that don't need in-depth coverage.

### Full Article (with body)

Adding a `body` field turns the news entry into a full article with its own page on the site. The body is written in **Markdown** and supports headings, bold text, lists, and other standard Markdown formatting.

Use a full article when:
- The news deserves in-depth analysis or explanation
- There are multiple aspects to cover (timeline, impact, what it means for cardholders, etc.)
- You want to provide context beyond a 1-2 sentence summary

## Templates

### Short Update Template

```yaml
id: "unique-id-for-this-news"
date: "2024-03-15"
title: "Short Title for the News"
summary: "A brief 1-2 sentence description of the news update."
tags:
  - new-card
bank: "Bank Name"  # optional
card_slug: "card-slug"  # optional, links to card page
card_name: "Card Display Name"  # required if card_slug is provided
source: "Source Name"  # optional
source_url: "https://example.com/article"  # optional
```

### Full Article Template

```yaml
id: "unique-id-for-this-news"
date: "2024-03-15"
title: "Short Title for the News"
summary: "A brief 1-2 sentence description of the news update."
tags:
  - new-card
bank: "Bank Name"  # optional
card_slug: "card-slug"  # optional, links to card page
card_name: "Card Display Name"  # required if card_slug is provided
source: "Source Name"  # optional
source_url: "https://example.com/article"  # optional
body: |
  Opening paragraph that introduces the news and provides context.

  ## Section Heading

  More detail about a specific aspect of the news. You can use **bold text**
  for emphasis and standard Markdown formatting.

  ## What This Means for Cardholders

  Explain the practical impact. This is the section readers care about most.
```

### Multiple Cards Template

When a news item relates to more than one card, use `card_slugs` and `card_names` (plural) instead of the singular versions:

```yaml
id: "unique-id-for-this-news"
date: "2024-03-15"
title: "Issuer Updates Multiple Cards"
summary: "Brief description of the change."
tags:
  - policy-change
bank: "Bank Name"
card_slugs:
  - "card-slug-one"
  - "card-slug-two"
card_names:
  - "Card Name One"
  - "Card Name Two"
```

## Body Field Guidelines

- Written in **Markdown** (headings, bold, lists, etc.)
- Maximum **15,000 characters**
- Use `|` (literal block scalar) after `body:` to preserve line breaks
- Structure with `##` headings to break up sections
- Always include a section explaining impact on cardholders
- Keep paragraphs concise and scannable

## Valid Tags

| Tag | Description |
|-----|-------------|
| `new-card` | New credit card launched |
| `discontinued` | Card no longer accepting applications |
| `bonus-change` | Welcome bonus increased or decreased |
| `fee-change` | Annual fee or other fees changed |
| `benefit-change` | Card benefits added, removed, or modified |
| `limited-time` | Temporary offer or promotion |
| `policy-change` | Issuer policy update |
| `general` | Other credit card news |

## Field Descriptions

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (lowercase, hyphens only) |
| `date` | Yes | Date of the news in YYYY-MM-DD format |
| `title` | Yes | Brief headline (keep under 200 characters) |
| `summary` | Yes | 1-2 sentence description (max 500 characters) |
| `tags` | Yes | Array of 1+ valid tags |
| `bank` | No | Bank/issuer name |
| `card_slug` | No | Card slug to link to card page (use for a single card) |
| `card_name` | No | Display name for card link (required if card_slug provided) |
| `card_slugs` | No | Array of card slugs (use instead of card_slug for multiple cards) |
| `card_names` | No | Array of card display names (required if card_slugs provided) |
| `source` | No | Name of the source |
| `source_url` | No | URL to the original article |
| `body` | No | Full article content in Markdown (max 15,000 characters) |

## Validation

Before submitting, you can validate your news file locally:

```bash
npm run build:news
```

This will check for:
- Required fields
- Valid date format
- Valid tags
- Valid ID format (lowercase with hyphens)

## Questions?

[Open an issue](https://github.com/CreditOdds/creditodds/issues) if you have questions or need help.
