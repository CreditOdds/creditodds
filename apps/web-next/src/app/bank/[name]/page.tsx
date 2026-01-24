import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getCardsByBank, getAllBanks } from "@/lib/api";
import { BuildingLibraryIcon } from "@heroicons/react/24/solid";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";

interface BankPageProps {
  params: Promise<{ name: string }>;
}

// Generate static pages for all banks at build time
export async function generateStaticParams() {
  try {
    const banks = await getAllBanks();
    return banks.map((bank) => ({
      name: encodeURIComponent(bank),
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

  const cards = await getCardsByBank(bankName);

  if (cards.length === 0) {
    notFound();
  }

  // Sort cards: accepting applications first, then by name
  const sortedCards = [...cards].sort((a, b) => {
    if (a.accepting_applications !== b.accepting_applications) {
      return a.accepting_applications ? -1 : 1;
    }
    return a.card_name.localeCompare(b.card_name);
  });

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
            {sortedCards.length} credit card{sortedCards.length !== 1 ? 's' : ''} available
          </p>
        </div>

        {/* Cards Table */}
        <div className="mt-8 flex flex-col">
          <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                        Card
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 hidden sm:table-cell">
                        Median Credit Score
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 hidden md:table-cell">
                        Median Income
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 hidden lg:table-cell">
                        Records
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {sortedCards.map((card) => (
                      <tr key={card.card_id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6">
                          <Link href={`/card/${encodeURIComponent(card.card_name)}`} className="flex items-center group">
                            {card.card_image_link && (
                              <div className="h-10 w-16 flex-shrink-0 mr-4 hidden sm:block">
                                <Image
                                  src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`}
                                  alt={card.card_name}
                                  width={64}
                                  height={40}
                                  className="h-10 w-16 object-contain"
                                />
                              </div>
                            )}
                            <div className="text-sm font-medium text-indigo-600 group-hover:text-indigo-900">
                              {card.card_name}
                            </div>
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 hidden sm:table-cell">
                          {card.approved_median_credit_score || '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 hidden md:table-cell">
                          {card.approved_median_income ? `$${card.approved_median_income.toLocaleString()}` : '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 hidden lg:table-cell">
                          {(card.approved_count || 0) + (card.rejected_count || 0)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          {card.accepting_applications ? (
                            <span className="inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-gray-100 px-2 text-xs font-semibold leading-5 text-gray-800">
                              Archived
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
