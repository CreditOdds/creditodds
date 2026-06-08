import { Card } from '@/lib/api';

/**
 * JSON-LD Structured Data Components (#12)
 * For rich search results
 */

interface OrganizationSchemaProps {
  name?: string;
  url?: string;
}

export function OrganizationSchema({
  name = 'CreditOdds',
  url = 'https://creditodds.com'
}: OrganizationSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url,
    logo: `${url}/logo.png`,
    sameAs: [
      'https://x.com/creditodds',
      'https://github.com/CreditOdds',
      'https://www.linkedin.com/company/creditodds',
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

interface WebsiteSchemaProps {
  name?: string;
  url?: string;
}

export function WebsiteSchema({
  name = 'CreditOdds',
  url = 'https://creditodds.com'
}: WebsiteSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    alternateName: 'Credit Odds',
    url,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${url}/explore?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

interface CreditCardSchemaProps {
  card: Card;
  ratings?: { count: number; average: number | null };
}

export function buildCreditCardSchema({ card, ratings }: CreditCardSchemaProps) {
  const hasRatings = !!ratings && ratings.count > 0 && ratings.average !== null;
  const schema = {
    '@context': 'https://schema.org',
    // Use Product only when we have an aggregateRating to attach — Product
    // snippets require review or aggregateRating, and GSC flags cards with
    // neither. Plain CreditCard avoids the Product-snippets check entirely.
    '@type': hasRatings ? 'Product' : 'CreditCard',
    ...(hasRatings ? { additionalType: 'https://schema.org/CreditCard' } : {}),
    name: card.card_name,
    url: card.slug ? `https://creditodds.com/card/${card.slug}` : undefined,
    category: 'Credit card',
    brand: {
      '@type': 'Brand',
      name: card.bank,
    },
    description: `${card.card_name} by ${card.bank}. Average approved credit score: ${card.approved_median_credit_score || 'N/A'}, average approved income: $${card.approved_median_income?.toLocaleString() || 'N/A'}.`,
    image: card.slug ? `https://creditodds.com/card/${card.slug}/opengraph-image` : undefined,
    // No `offers` block: credit cards aren't shippable goods, so emitting an
    // Offer triggers Google's Merchant-listings check for hasMerchantReturnPolicy
    // and shippingDetails — fields that don't apply here. Annual fee is exposed
    // via additionalProperty instead.
    aggregateRating: hasRatings ? {
      '@type': 'AggregateRating',
      ratingValue: ratings!.average!.toFixed(1),
      ratingCount: ratings!.count,
      bestRating: 5,
      worstRating: 0,
    } : undefined,
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        name: 'Annual Fee',
        value: card.annual_fee != null ? `$${card.annual_fee}` : 'N/A',
      },
      {
        '@type': 'PropertyValue',
        name: 'Median Approved Credit Score',
        value: card.approved_median_credit_score || 'N/A',
      },
      {
        '@type': 'PropertyValue',
        name: 'Median Approved Income',
        value: card.approved_median_income ? `$${card.approved_median_income.toLocaleString()}` : 'N/A',
      },
      {
        '@type': 'PropertyValue',
        name: 'Median Length of Credit History',
        value: card.approved_median_length_credit ? `${card.approved_median_length_credit} years` : 'N/A',
      },
      ...(card.apr?.purchase_intro ? [{
        '@type': 'PropertyValue',
        name: 'Intro APR on Purchases',
        value: `${card.apr.purchase_intro.rate}% for ${card.apr.purchase_intro.months} months`,
      }] : []),
      ...(card.apr?.balance_transfer_intro ? [{
        '@type': 'PropertyValue',
        name: 'Intro APR on Balance Transfers',
        value: `${card.apr.balance_transfer_intro.rate}% for ${card.apr.balance_transfer_intro.months} months`,
      }] : []),
      ...(card.apr?.regular ? [{
        '@type': 'PropertyValue',
        name: 'Regular APR',
        value: `${card.apr.regular.min}%-${card.apr.regular.max}%`,
      }] : []),
    ],
  };

  // Remove undefined values
  return JSON.parse(JSON.stringify(schema));
}

export function CreditCardSchema({ card, ratings }: CreditCardSchemaProps) {
  const cleanSchema = buildCreditCardSchema({ card, ratings });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(cleanSchema) }}
    />
  );
}

interface BreadcrumbSchemaProps {
  items: { name: string; url: string }[];
}

export function BreadcrumbSchema({ items }: BreadcrumbSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

interface CollectionPageSchemaProps {
  url: string;
  name: string;
  description?: string;
  dateModified?: string;
  datePublished?: string;
  items: { name: string; url: string }[];
}

export function CollectionPageSchema({
  url,
  name,
  description,
  dateModified,
  datePublished,
  items,
}: CollectionPageSchemaProps) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    url,
    name,
    ...(description ? { description } : {}),
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    mainEntity: {
      '@type': 'ItemList',
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        url: item.url,
      })),
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

interface FAQSchemaProps {
  questions: { question: string; answer: string }[];
}

export function FAQSchema({ questions }: FAQSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
