import { Metadata } from "next";
import Link from "next/link";
import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { getArticles } from "@/lib/articles";
import { ArticlesListClient } from "@/components/articles/ArticlesListClient";

export const metadata: Metadata = {
  title: "Credit Card Articles - Guides & Strategies",
  description: "In-depth guides, strategies, and analysis to help you maximize your credit card rewards and make smarter financial decisions.",
  openGraph: {
    title: "Credit Card Articles | CreditOdds",
    description: "Guides, strategies, and analysis for credit card rewards optimization.",
    url: "https://creditodds.com/articles",
  },
  alternates: {
    canonical: "https://creditodds.com/articles",
  },
};

// Revalidate every 5 minutes
export const revalidate = 300;

export default async function ArticlesPage() {
  const articles = await getArticles();

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
                <span className="ml-4 text-sm font-medium text-gray-500">Articles</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-2">
            <DocumentTextIcon className="h-8 w-8 text-indigo-600" aria-hidden="true" />
            <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Articles
            </h1>
          </div>
          <p className="mt-2 text-lg text-gray-500 max-w-2xl mx-auto">
            In-depth guides, strategies, and analysis to help you maximize your credit card rewards
          </p>
        </div>

        {/* Articles List with Filters and Pagination */}
        {articles.length > 0 ? (
          <ArticlesListClient articles={articles} />
        ) : (
          <div className="text-center py-12">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No articles yet</h3>
            <p className="mt-1 text-sm text-gray-500">Check back soon for guides and strategies.</p>
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">
            Ready to find your next card?
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
