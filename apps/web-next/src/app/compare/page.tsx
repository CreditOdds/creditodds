import { Suspense } from 'react';
import { Metadata } from 'next';
import { getAllCards } from '@/lib/api';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import CompareClient from './CompareClient';
import { V2Footer } from '@/components/landing-v2/Chrome';
import '../landing.css';

export const revalidate = 300;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ cards?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const baseTitle = 'Compare Credit Cards | CreditOdds';
  const baseDescription = 'Compare up to 3 credit cards side-by-side. See rewards, signup bonuses, APR, annual fees, and approval odds all in one place.';

  if (!params.cards) return { title: baseTitle, description: baseDescription };
  const slugs = params.cards.split(',').filter(Boolean).slice(0, 3);
  if (slugs.length === 0) return { title: baseTitle, description: baseDescription };

  const allCards = await getAllCards();
  const matchedCards = slugs
    .map((slug) => allCards.find((c) => c.slug === slug))
    .filter(Boolean);
  if (matchedCards.length === 0) return { title: baseTitle, description: baseDescription };

  const cardNames = matchedCards.map((c) => c!.card_name);
  const title = `Compare ${cardNames.join(' vs ')} | CreditOdds`;

  return {
    title,
    description: baseDescription,
    openGraph: {
      title,
      description: baseDescription,
      url: `https://creditodds.com/compare?cards=${slugs.join(',')}`,
      type: "website",
      images: [`/api/og/compare?cards=${slugs.join(',')}`],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: baseDescription,
      images: [`/api/og/compare?cards=${slugs.join(',')}`],
    },
  };
}

export default async function ComparePage() {
  const cards = await getAllCards();

  return (
    <div className="landing-v2 compare-v2">
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: 'Compare Cards', url: 'https://creditodds.com/compare' },
        ]}
      />

      <section className="page-hero wrap">
        <h1 className="page-title">
          Compare <em>credit cards.</em>
        </h1>
        <p className="page-sub">
          Pick up to three cards and see rewards, signup bonuses, APR, annual fees, and
          approval odds lined up in one place.
        </p>
      </section>

      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 64 }}>
        <Suspense
          fallback={
            <div
              style={{
                padding: '48px 0',
                color: 'var(--muted)',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
              }}
            >
              Loading…
            </div>
          }
        >
          <CompareClient allCards={cards} />
        </Suspense>
      </div>
      <V2Footer />
    </div>
  );
}
