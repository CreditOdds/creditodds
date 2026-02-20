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
    sameAs: [],
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
        urlTemplate: `${url}/card/{search_term_string}`,
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
}

export function CreditCardSchema({ card }: CreditCardSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: card.card_name,
    provider: {
      '@type': 'Organization',
      name: card.bank,
    },
    category: 'Credit Card',
    description: `${card.card_name} by ${card.bank}. Average approved credit score: ${card.approved_median_credit_score || 'N/A'}, average approved income: $${card.approved_median_income?.toLocaleString() || 'N/A'}.`,
    offers: {
      '@type': 'Offer',
      availability: card.accepting_applications
        ? 'https://schema.org/InStock'
        : 'https://schema.org/Discontinued',
    },
    aggregateRating: card.approved_count && card.approved_count > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: ((card.approved_count / ((card.approved_count || 0) + (card.rejected_count || 0))) * 5).toFixed(1),
      ratingCount: (card.approved_count || 0) + (card.rejected_count || 0),
      bestRating: 5,
      worstRating: 1,
    } : undefined,
    additionalProperty: [
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
    ],
  };

  // Remove undefined values
  const cleanSchema = JSON.parse(JSON.stringify(schema));

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
