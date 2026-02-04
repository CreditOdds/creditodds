import { Metadata } from "next";
import Link from "next/link";
import { getAllCards, getRecentRecords } from "@/lib/api";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import ExploreClient from "./ExploreClient";
import RecordsTicker from "@/components/ui/RecordsTicker";

// Revalidate every 5 minutes
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Explore Credit Cards",
  description: "Browse all credit cards and their approval odds. Compare credit scores, income requirements, and approval rates across different banks.",
  openGraph: {
    title: "Explore Credit Cards | CreditOdds",
    description: "Browse all credit cards and compare approval odds.",
  },
};

export default async function ExplorePage() {
  const [cards, recentRecords] = await Promise.all([
    getAllCards(),
    getRecentRecords(),
  ]);

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
      {/* Recent Records Ticker - Desktop Only (temporarily hidden) */}
      {/* <RecordsTicker records={recentRecords} /> */}
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-center gap-3">
          <MagnifyingGlassIcon className="h-8 w-8 text-indigo-600" aria-hidden="true" />
          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Explore Credit Cards
          </h1>
        </div>
        <p className="mt-2 text-center text-lg text-gray-500">
          {cards.length} credit cards from {banks.length} banks
        </p>

        {/* Client component for filtering/search */}
        <ExploreClient cards={sortedCards} banks={banks} />
      </div>
    </div>
  );
}
