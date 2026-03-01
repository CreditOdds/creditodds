import { Suspense } from 'react';
import Link from 'next/link';
import { getAllCards } from '@/lib/api';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import CompareClient from './CompareClient';

export const revalidate = 300;

export const metadata = {
  title: 'Compare Credit Cards | CreditOdds',
  description: 'Compare up to 3 credit cards side-by-side. See rewards, signup bonuses, APR, annual fees, and approval odds all in one place.',
};

export default async function ComparePage() {
  const cards = await getAllCards();

  return (
    <div className="bg-gray-50 min-h-screen">
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: 'Compare Cards', url: 'https://creditodds.com/compare' },
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
                <span className="ml-4 text-sm font-medium text-gray-500 truncate">Compare Cards</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Compare Credit Cards
        </h1>
        <p className="mt-2 text-gray-600">
          Select up to 3 cards to compare side-by-side.
        </p>

        <Suspense fallback={<div className="mt-8 text-gray-500">Loading...</div>}>
          <CompareClient allCards={cards} />
        </Suspense>
      </div>
    </div>
  );
}
