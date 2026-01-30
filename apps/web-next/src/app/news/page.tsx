import { Metadata } from "next";
import Link from "next/link";
import { NewspaperIcon, BuildingLibraryIcon, CreditCardIcon } from "@heroicons/react/24/outline";
import { newsItems, tagLabels, tagColors, NewsTag } from "@/data/news";

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
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tagColors[tag]}`}>
      {tagLabels[tag]}
    </span>
  );
}

export default function NewsPage() {
  // Get unique banks and tags for filtering (future enhancement)
  const banks = [...new Set(newsItems.filter(item => item.bank).map(item => item.bank))];
  const allTags = [...new Set(newsItems.flatMap(item => item.tags))];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <NewspaperIcon className="mx-auto h-16 w-16 text-indigo-600" />
          <h1 className="mt-4 text-4xl font-bold text-gray-900">Card News</h1>
          <p className="mt-2 text-lg text-gray-600">
            Stay up to date with the latest credit card updates and changes
          </p>
        </div>

        {/* Tag Legend */}
        <div className="mb-8 flex flex-wrap gap-2 justify-center">
          {allTags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
        </div>

        {/* News Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Update
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(item.date)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {item.title}
                      </div>
                      <div className="text-sm text-gray-500 mt-1 line-clamp-2">
                        {item.summary}
                      </div>
                      {/* Mobile tags */}
                      <div className="flex flex-wrap gap-1 mt-2 md:hidden">
                        {item.tags.map((tag) => (
                          <TagBadge key={tag} tag={tag} />
                        ))}
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
                        {item.cardSlug && item.cardName && (
                          <Link
                            href={`/card/${item.cardSlug}`}
                            className="flex items-center text-sm text-indigo-600 hover:text-indigo-900"
                          >
                            <CreditCardIcon className="h-4 w-4 mr-1" />
                            {item.cardName}
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
        </div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{newsItems.length}</p>
            <p className="text-sm text-gray-500">Total Updates</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {newsItems.filter(i => i.tags.includes('new-card')).length}
            </p>
            <p className="text-sm text-gray-500">New Cards</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {newsItems.filter(i => i.tags.includes('bonus-change')).length}
            </p>
            <p className="text-sm text-gray-500">Bonus Changes</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-2xl font-bold text-indigo-600">{banks.length}</p>
            <p className="text-sm text-gray-500">Banks Covered</p>
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
