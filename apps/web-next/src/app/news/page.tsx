import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { NewspaperIcon, BuildingLibraryIcon, CreditCardIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { getNews, tagLabels, tagColors, NewsTag } from "@/lib/news";
import { ExpandableText } from "@/components/ui/ExpandableText";

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

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function TagBadge({ tag }: { tag: NewsTag }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${tagColors[tag]}`}>
      {tagLabels[tag]}
    </span>
  );
}

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
          <div className="bg-white shadow sm:rounded-lg overflow-hidden">
          {newsItems.length > 0 ? (
            <div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Update
                    </th>
                    <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                      Bank / Card
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                      Tags
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {newsItems.slice(0, 20).map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div className="flex items-start gap-2 sm:gap-3">
                          {/* Card image on mobile */}
                          {item.card_image_link && (
                            <Link href={`/card/${item.card_slug}`} className="flex-shrink-0 sm:hidden">
                              <Image
                                src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${item.card_image_link}`}
                                alt={item.card_name || ''}
                                width={40}
                                height={25}
                                className="rounded-sm object-contain"
                                sizes="40px"
                              />
                            </Link>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                              <span>{formatDate(item.date)}</span>
                              {/* Mobile: show bank name inline */}
                              {item.bank && (
                                <span className="sm:hidden text-gray-400">· {item.bank}</span>
                              )}
                            </div>
                            <div className="text-sm font-medium text-gray-900">
                              {item.title}
                            </div>
                            <ExpandableText
                              text={item.summary}
                              className="text-sm text-gray-500 mt-1"
                            />
                            {/* Mobile tags */}
                            <div className="flex flex-wrap gap-1 mt-2 md:hidden">
                              {item.tags.map((tag) => (
                                <TagBadge key={tag} tag={tag} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                        <div className="flex flex-col gap-1">
                          {item.bank && (
                            <div className="flex items-center text-sm text-gray-600">
                              <BuildingLibraryIcon className="h-4 w-4 mr-1 text-gray-400" />
                              {item.bank}
                            </div>
                          )}
                          {item.card_slug && item.card_name && (
                            <Link
                              href={`/card/${item.card_slug}`}
                              className="flex items-center text-sm text-indigo-600 hover:text-indigo-900"
                            >
                              {item.card_image_link ? (
                                <Image
                                  src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${item.card_image_link}`}
                                  alt={item.card_name}
                                  width={32}
                                  height={20}
                                  className="mr-1.5 rounded-sm object-contain"
                                  sizes="40px"
                                />
                              ) : (
                                <CreditCardIcon className="h-4 w-4 mr-1" />
                              )}
                              {item.card_name}
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {item.tags.map((tag) => (
                            <TagBadge key={tag} tag={tag} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-gray-500">
              No news updates available yet. Check back soon!
            </div>
          )}
          </div>
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
