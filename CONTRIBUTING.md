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
│   └── web/          # React frontend
├── data/
│   └── cards/        # Card YAML files
│       └── images/   # Card images
└── packages/
    └── shared/       # Shared code
```

## Questions?

- [Open an issue](https://github.com/CreditOdds/creditodds/issues)
- Visit [creditodds.com/contact](https://creditodds.com/contact)
