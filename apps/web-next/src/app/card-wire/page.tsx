import { Metadata } from 'next';
import { getAllCardWire, getAllCards } from '@/lib/api';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import CardWireV2Client from './CardWireV2Client';

export const metadata: Metadata = {
  title: 'Card Wire - Credit Card Updates & Changes',
  description: 'A live feed of credit card changes — annual fee updates, sign-up bonus changes, reward rate shifts, and APR adjustments across all major cards.',
  openGraph: {
    title: 'Card Wire | CreditOdds',
    description: 'Live feed of credit card changes — fees, bonuses, rates, and more.',
    url: 'https://creditodds.com/card-wire',
    type: 'website',
  },
  alternates: {
    canonical: 'https://creditodds.com/card-wire',
  },
};

export const revalidate = 300;

export default async function CardWirePage() {
  const [entries, cards] = await Promise.all([
    getAllCardWire(200),
    getAllCards(),
  ]);

  // Build card_name → slug map for linking
  const slugMap: Record<string, string> = {};
  const bonusTypeMap: Record<string, string> = {};
  for (const card of cards) {
    slugMap[card.card_name] = String(card.slug ?? card.card_id);
    if (card.signup_bonus?.type) {
      const typeLabels: Record<string, string> = {
        points: 'pts',
        miles: 'miles',
        cashback: 'cash',
        cash: 'cash',
        free_nights: 'free nights',
      };
      bonusTypeMap[card.card_name] = typeLabels[card.signup_bonus.type] || card.signup_bonus.type;
    }
  }

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: 'Card Wire', url: 'https://creditodds.com/card-wire' },
        ]}
      />
      <CardWireV2Client entries={entries} slugMap={slugMap} bonusTypeMap={bonusTypeMap} />
    </>
  );
}
