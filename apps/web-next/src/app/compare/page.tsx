import { Suspense } from 'react';
import { Metadata } from 'next';
import { getAllCards, type Card } from '@/lib/api';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import CompareClient from './CompareClient';
import { V2Footer } from '@/components/landing-v2/Chrome';
import '../landing.css';

export const revalidate = 300;

// CompareClient receives the full catalog (for the picker) and renders the
// comparison table from whichever cards are selected, so rewards/benefits/apr/
// medians must stay. We only drop fields the page never reads — referrals,
// our_take, previous_names, apply links, tags, etc. Smaller cut than Explore
// because the rich comparison data is genuinely needed here.
function slimForCompare(c: Card): Card {
  return {
    card_id: c.card_id,
    card_name: c.card_name,
    slug: c.slug,
    bank: c.bank,
    card_image_link: c.card_image_link,
    accepting_applications: c.accepting_applications,
    annual_fee: c.annual_fee,
    reward_type: c.reward_type,
    approved_median_credit_score: c.approved_median_credit_score,
    approved_median_income: c.approved_median_income,
    signup_bonus: c.signup_bonus,
    apr: c.apr,
    rewards: c.rewards,
    benefits: c.benefits,
  };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ cards?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const baseTitle = 'Compare Credit Cards | CreditOdds';
  const baseDescription = 'Compare up to 3 credit cards side-by-side. See rewards, signup bonuses, APR, annual fees, and approval odds all in one place.';
  const baseCanonical = 'https://creditodds.com/compare';

  if (!params.cards) {
    return {
      title: baseTitle,
      description: baseDescription,
      alternates: { canonical: baseCanonical },
    };
  }
  const slugs = params.cards.split(',').filter(Boolean).slice(0, 3);
  if (slugs.length === 0) {
    return {
      title: baseTitle,
      description: baseDescription,
      alternates: { canonical: baseCanonical },
    };
  }

  const allCards = await getAllCards();
  const matchedCards = slugs
    .map((slug) => allCards.find((c) => c.slug === slug))
    .filter(Boolean);
  if (matchedCards.length === 0) {
    return {
      title: baseTitle,
      description: baseDescription,
      alternates: { canonical: baseCanonical },
    };
  }

  const cardNames = matchedCards.map((c) => c!.card_name);
  const title = `Compare ${cardNames.join(' vs ')} | CreditOdds`;
  const sortedSlugs = [...slugs].sort();
  const canonical = `${baseCanonical}?cards=${sortedSlugs.join(',')}`;

  return {
    title,
    description: baseDescription,
    openGraph: {
      title,
      description: baseDescription,
      url: canonical,
      type: "website",
      images: [`/api/og/compare?cards=${slugs.join(',')}`],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: baseDescription,
      images: [`/api/og/compare?cards=${slugs.join(',')}`],
    },
    alternates: {
      canonical,
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

      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <span className="cj-crumb cj-crumb-current" aria-current="page">Compare</span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span><span className="cj-status-dot" />{cards.length.toLocaleString()} cards · live</span>
        </div>
      </div>

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
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 13,
              }}
            >
              Loading…
            </div>
          }
        >
          <CompareClient allCards={cards.map(slimForCompare)} />
        </Suspense>
      </div>
      <V2Footer />
    </div>
  );
}
