import { Metadata } from 'next';
import Link from 'next/link';
import { BoltIcon } from '@heroicons/react/24/outline';
import { getAllCardWire, getAllCards } from '@/lib/api';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import CardWireTable from './CardWireTable';

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
  for (const card of cards) {
    slugMap[card.card_name] = String(card.slug ?? card.card_id);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: 'Card Wire', url: 'https://creditodds.com/card-wire' },
      ]} />

      {/* Breadcrumbs */}
      <nav className="bg-white border-b border-gray-200" aria-label="Breadcrumb">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ol className="flex items-center space-x-4 py-4 overflow-hidden">
            <li>
              <Link href="/" className="text-gray-400 hover:text-gray-500">
                Home
              </Link>
            </li>
            <li>
              <div className="flex items-center">
                <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
                </svg>
                <span className="ml-4 text-sm font-medium text-gray-500 truncate">Card Wire</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Header */}
        <div className="flex items-center justify-center gap-3">
          <BoltIcon className="h-8 w-8 text-indigo-600" aria-hidden="true" />
          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Card Wire
          </h1>
        </div>
        <p className="mt-2 text-center text-lg text-gray-500">
          Live feed of credit card changes — fees, bonuses, rates, and more
        </p>

        {/* Table */}
        <div className="mt-8 -mx-4 sm:mx-0">
          <CardWireTable entries={entries} slugMap={slugMap} />
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">
            Browse all cards and compare their current offers.
          </p>
          <Link
            href="/explore"
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Explore All Cards
          </Link>
        </div>
      </div>
    </div>
  );
}
