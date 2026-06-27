import { Metadata } from 'next';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import { V2Footer } from '@/components/landing-v2/Chrome';
import { getAllCards } from '@/lib/api';
import BestCardForMeClient from './BestCardForMeClient';
import '../landing.css';

export const metadata: Metadata = {
  title: 'Best Card For Me',
  description:
    'Answer a few questions about how you spend and which cards you already have, and get a personalized ranking of the best credit cards to get next.',
  openGraph: {
    title: 'Best Card For Me | CreditOdds',
    description:
      'A personalized ranking of the best credit cards to get next, based on how you spend and the cards already in your wallet.',
    url: 'https://creditodds.com/best-card-for-me',
    type: 'website',
  },
  alternates: {
    canonical: 'https://creditodds.com/best-card-for-me',
  },
};

// Personalized tool: the ranking is computed per-request, but the catalog the
// quiz searches is fetched with ISR like the rest of the site.
export const revalidate = 300;

export default async function BestCardForMePage() {
  const cards = await getAllCards();

  return (
    <div className="landing-v2 best-for-me-v2">
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: 'Best Card For Me', url: 'https://creditodds.com/best-card-for-me' },
        ]}
      />

      <section className="bcfm-hero">
        <div className="wrap">
          <p className="bcfm-eyebrow">Personalized</p>
          <h1 className="bcfm-hero-title">Which card should you get next?</h1>
          <p className="bcfm-hero-sub">
            Tell us how you spend and which cards you already carry. We rank the cards that add the
            most ongoing value on top of your wallet, not just the flashiest signup bonus.
          </p>
        </div>
      </section>

      <section className="wrap bcfm-main">
        <BestCardForMeClient allCards={cards} />
      </section>

      <V2Footer />
    </div>
  );
}
