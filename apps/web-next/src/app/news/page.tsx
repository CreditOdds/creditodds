import { Metadata } from "next";
import Link from "next/link";
import { NewspaperIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { getNews } from "@/lib/news";
import NewsTable from "@/components/news/NewsTable";

export const metadata: Metadata = {
  title: "Card News - Credit Card Updates",
  description: "Stay up to date with the latest credit card news, bonus changes, new card launches, and policy updates from major banks.",
  openGraph: {
    title: "Card News | CreditOdds",
    description: "Latest credit card news, bonus changes, and updates from major banks.",
    url: "https://creditodds.com/news",
  },
  alternates: {
    canonical: "https://creditodds.com/news",
  },
};

// Revalidate every 5 minutes
export const revalidate = 300;

export default async function NewsPage() {
  const newsItems = await getNews();

  return (
    <div className="min-h-screen bg-gray-50">
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
                <span className="ml-4 text-sm font-medium text-gray-500">Card News</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Header */}
        <div className="flex items-center justify-center gap-3">
          <NewspaperIcon className="h-8 w-8 text-indigo-600" aria-hidden="true" />
          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Card News
          </h1>
        </div>
        <p className="mt-2 text-center text-lg text-gray-500">
          Stay up to date with the latest credit card updates and changes
        </p>

        {/* Add News Link */}
        <div className="mt-4 text-center">
          <a
            href="https://github.com/CreditOdds/creditodds/blob/main/data/news/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800"
          >
            <PlusCircleIcon className="h-4 w-4" />
            Add News
          </a>
        </div>

        {/* News Table */}
        <div className="mt-8 -mx-4 sm:mx-0">
          <NewsTable newsItems={newsItems} />
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">
            Want to explore cards mentioned in the news?
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
