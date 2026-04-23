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
  ratings?: { count: number; average: number | null };
}

export function CreditCardSchema({ card, ratings }: CreditCardSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CreditCard',
    name: card.card_name,
    brand: {
      '@type': 'Brand',
      name: card.bank,
    },
    description: `${card.card_name} by ${card.bank}. Average approved credit score: ${card.approved_median_credit_score || 'N/A'}, average approved income: $${card.approved_median_income?.toLocaleString() || 'N/A'}.`,
    image: card.slug ? `https://creditodds.com/card/${card.slug}/opengraph-image` : undefined,
    offers: {
      '@type': 'Offer',
      availability: card.accepting_applications
        ? 'https://schema.org/InStock'
        : 'https://schema.org/Discontinued',
      ...(card.annual_fee != null ? {
        price: String(card.annual_fee),
        priceCurrency: 'USD',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: String(card.annual_fee),
          priceCurrency: 'USD',
          unitText: 'ANNUAL',
        },
      } : {}),
    },
    aggregateRating: ratings && ratings.count > 0 && ratings.average !== null ? {
      '@type': 'AggregateRating',
      ratingValue: ratings.average.toFixed(1),
      ratingCount: ratings.count,
      bestRating: 5,
      worstRating: 0,
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
