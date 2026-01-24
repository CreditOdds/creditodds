import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getAllCards } from "@/lib/api";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import ExploreClient from "./ExploreClient";

export const metadata: Metadata = {
  title: "Explore Credit Cards",
  description: "Browse all credit cards and their approval odds. Compare credit scores, income requirements, and approval rates across different banks.",
  openGraph: {
    title: "Explore Credit Cards | CreditOdds",
    description: "Browse all credit cards and compare approval odds.",
  },
};

export default async function ExplorePage() {
  const cards = await getAllCards();

  // Sort cards: by bank, then by name
  const sortedCards = [...cards].sort((a, b) => {
    if (a.bank !== b.bank) {
      return a.bank.localeCompare(b.bank);
    }
    return a.card_name.localeCompare(b.card_name);
  });

  // Get unique banks for filtering
  const banks = Array.from(new Set(cards.map(card => card.bank))).sort();

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* JSON-LD Structured Data */}
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: 'Explore Cards', url: 'https://creditodds.com/explore' }
      ]} />

      {/* Breadcrumbs */}
      <nav className="bg-white border-b border-gray-200" aria-label="Breadcrumb">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ol className="flex items-center space-x-4 py-4">
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
                <span className="ml-4 text-sm font-medium text-gray-500">Explore Cards</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <div className="flex justify-center items-center mb-4">
            <MagnifyingGlassIcon className="h-12 w-12 text-indigo-600" aria-hidden="true" />
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">
            Explore Credit Cards
          </h1>
          <p className="mt-4 text-xl text-gray-500">
            {cards.length} credit cards from {banks.length} banks
          </p>
        </div>

        {/* Client component for filtering/search */}
        <ExploreClient cards={sortedCards} banks={banks} />
      </div>
    </div>
  );
}
