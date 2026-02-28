import { Metadata } from "next";
import Link from "next/link";
import { TrophyIcon, CalendarIcon } from "@heroicons/react/24/outline";
import { getBestPages } from "@/lib/best";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";

export const metadata: Metadata = {
  title: "Best Credit Cards - Top Picks & Comparisons",
  description: "Curated rankings of the best credit cards across categories. Data-driven picks updated with live approval odds and bonus values.",
  openGraph: {
    title: "Best Credit Cards | CreditOdds",
    description: "Curated rankings of the best credit cards across categories.",
    url: "https://creditodds.com/best",
  },
  alternates: {
    canonical: "https://creditodds.com/best",
  },
};

export const revalidate = 300;

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function BestIndexPage() {
  const pages = await getBestPages();

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Best Credit Cards",
    description: "Curated rankings of the best credit cards across categories.",
    url: "https://creditodds.com/best",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: pages.slice(0, 10).map((page, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `https://creditodds.com/best/${page.slug}`,
      })),
    },
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: 'Best Cards', url: 'https://creditodds.com/best' },
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
                <span className="ml-4 text-sm font-medium text-gray-500">Best Cards</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-2">
            <TrophyIcon className="h-8 w-8 text-indigo-600" aria-hidden="true" />
            <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Best Cards
            </h1>
          </div>
          <p className="mt-2 text-lg text-gray-500 max-w-2xl mx-auto">
            Curated rankings of the best credit cards, updated with live data
          </p>
        </div>

        {/* Pages Grid */}
        {pages.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {pages.map((page) => (
              <Link
                key={page.id}
                href={`/best/${page.slug}`}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-indigo-200 transition-all"
              >
                <h2 className="text-lg font-bold text-gray-900 mb-2">
                  {page.title}
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  {page.description}
                </p>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <div className="flex items-center gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    <span>{formatDate(page.updated_at || page.date)}</span>
                  </div>
                  <span className="font-medium text-indigo-600">
                    {page.cards.length} cards
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <TrophyIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No rankings yet</h3>
            <p className="mt-1 text-sm text-gray-500">Check back soon for curated card rankings.</p>
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">
            Want to explore all cards?
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
