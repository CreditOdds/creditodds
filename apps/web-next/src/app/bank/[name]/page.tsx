import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCardsByBank, getAllBanks } from "@/lib/api";
import { BuildingLibraryIcon } from "@heroicons/react/24/solid";
import { NewspaperIcon } from "@heroicons/react/24/outline";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import { getNews, tagLabels, tagColors } from "@/lib/news";
import BankCardsTable from "./BankCardsTable";

interface BankPageProps {
  params: Promise<{ name: string }>;
}

// Generate static pages for all banks at build time
export async function generateStaticParams() {
  try {
    const banks = await getAllBanks();
    return banks.map((bank) => ({
      name: bank,
    }));
  } catch {
    return [];
  }
}

// Dynamic metadata for SEO
export async function generateMetadata({ params }: BankPageProps): Promise<Metadata> {
  const { name } = await params;
  const bankName = decodeURIComponent(name);

  return {
    title: `${bankName} Credit Cards`,
    description: `View all ${bankName} credit cards and their approval odds. Compare credit scores, income requirements, and approval rates.`,
    openGraph: {
      title: `${bankName} Credit Cards | CreditOdds`,
      description: `See approval odds for all ${bankName} credit cards.`,
    },
  };
}

export default async function BankPage({ params }: BankPageProps) {
  const { name } = await params;
  const bankName = decodeURIComponent(name);

  const [cards, allNews] = await Promise.all([
    getCardsByBank(bankName),
    getNews(),
  ]);

  if (cards.length === 0) {
    notFound();
  }

  // Filter news for this bank
  const bankNews = allNews.filter(news => news.bank === bankName);

  // Count active cards for the header
  const activeCardCount = cards.filter(c => c.accepting_applications).length;

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* JSON-LD Structured Data */}
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: bankName, url: `https://creditodds.com/bank/${encodeURIComponent(bankName)}` }
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
                <span className="ml-4 text-sm font-medium text-gray-500">{bankName}</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <div className="flex justify-center items-center mb-4">
            <BuildingLibraryIcon className="h-12 w-12 text-indigo-600" aria-hidden="true" />
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">
            {bankName}
          </h1>
          <p className="mt-4 text-xl text-gray-500">
            {activeCardCount} credit card{activeCardCount !== 1 ? 's' : ''} available
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cards Table - Full width on mobile, 2/3 on desktop */}
          <div className="col-span-1 lg:col-span-2 -mx-4 sm:mx-0">
            <BankCardsTable cards={cards} />
          </div>

          {/* News Sidebar - Below cards on mobile, 1/3 on desktop */}
          <div className="col-span-1">
            <div className="bg-white shadow ring-1 ring-black ring-opacity-5 rounded-lg overflow-hidden sticky top-4">
              <div className="px-4 py-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <NewspaperIcon className="h-5 w-5 text-indigo-600" />
                  <h2 className="text-base font-semibold text-gray-900">{bankName} News</h2>
                </div>
              </div>
              {bankNews.length > 0 ? (
                <ul className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
                  {bankNews.slice(0, 10).map((news) => (
                    <li key={news.id} className="px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400">
                          {new Date(news.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        {news.tags.slice(0, 1).map((tag) => (
                          <span
                            key={tag}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${tagColors[tag]}`}
                          >
                            {tagLabels[tag]}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm font-medium text-gray-900 line-clamp-2">{news.title}</p>
                      {news.card_slugs && news.card_names && news.card_slugs.length > 0 && (
                        <div className="mt-1 text-xs">
                          {news.card_slugs.map((s, i) => (
                            <span key={s}>
                              {i > 0 && <span className="text-gray-400">, </span>}
                              <Link
                                href={`/card/${s}`}
                                className="text-indigo-600 hover:text-indigo-900"
                              >
                                {news.card_names![i]}
                              </Link>
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-8 text-center">
                  <NewspaperIcon className="mx-auto h-8 w-8 text-gray-300" />
                  <p className="mt-2 text-sm text-gray-500">No {bankName} news yet</p>
                </div>
              )}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                <Link
                  href="/news"
                  className="text-sm text-indigo-600 hover:text-indigo-900"
                >
                  View all card news →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
