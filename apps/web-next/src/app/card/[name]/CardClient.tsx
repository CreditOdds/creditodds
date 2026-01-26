'use client';

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BuildingLibraryIcon } from "@heroicons/react/24/solid";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/auth/AuthProvider";
import { Card, GraphData } from "@/lib/api";
import SubmitRecordModal from "@/components/forms/SubmitRecordModal";
import { CreditCardSchema, BreadcrumbSchema } from "@/components/seo/JsonLd";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

// Dynamic import for Highcharts (client-side only)
const ScatterPlot = dynamic(() => import("@/components/charts/ScatterPlot"), {
  ssr: false,
  loading: () => <div className="h-64 flex items-center justify-center">Loading chart...</div>,
});

// Chart error fallback component (#10)
function ChartErrorFallback() {
  return (
    <div className="h-64 flex items-center justify-center bg-gray-100 rounded-lg">
      <p className="text-gray-500">Unable to load chart. Please refresh the page.</p>
    </div>
  );
}

interface CardClientProps {
  card: Card;
  graphData: GraphData[];
}

export default function CardClient({ card, graphData }: CardClientProps) {
  const [showModal, setShowModal] = useState(false);
  const { authState } = useAuth();
  const router = useRouter();

  const chartOne = graphData[0] || [];
  const chartTwo = graphData[1] || [];
  const chartThree = graphData[2] || [];

  // Refresh page data after successful submission (#8)
  const handleSubmitSuccess = () => {
    router.refresh();
  };

  return (
    <div className="bg-gray-50">
      {/* JSON-LD Structured Data (#12) */}
      <CreditCardSchema card={card} />
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: card.bank, url: `https://creditodds.com/bank/${encodeURIComponent(card.bank)}` },
        { name: card.card_name, url: `https://creditodds.com/card/${encodeURIComponent(card.card_name)}` }
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
                <Link href={`/bank/${encodeURIComponent(card.bank)}`} className="ml-4 text-sm font-medium text-gray-400 hover:text-gray-500">
                  {card.bank}
                </Link>
              </div>
            </li>
            <li>
              <div className="flex items-center">
                <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
                </svg>
                <span className="ml-4 text-sm font-medium text-gray-500">{card.card_name}</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      {/* Not accepting applications warning - full width */}
      {!card.accepting_applications && card.accepting_applications !== undefined && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex max-w-7xl mx-auto">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                This credit card is no longer accepting applications and has been archived.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Card Header */}
          <div className="text-center pt-6 pb-6 sm:pt-14 sm:pb-10">
            <h1 className="text-4xl font-extrabold text-gray-900 sm:text-4xl tracking-wide">
              {card.card_name}
            </h1>
            <Link href={`/bank/${encodeURIComponent(card.bank)}`} className="flex justify-center pt-2 group">
              <BuildingLibraryIcon className="h-5 w-5 text-gray-400 group-hover:text-indigo-500" aria-hidden="true" />
              <p className="pl-2 pr-2 tracking-wide text-sm text-gray-500 group-hover:text-indigo-600">{card.bank}</p>
            </Link>
          </div>

          {/* Card Info Section */}
          <div className="sm:flex pb-6">
            <div className="mb-4 flex-shrink-0 sm:mb-0 sm:mr-4">
              <Image
                src={card.card_image_link
                  ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                  : '/assets/generic-card.svg'}
                alt={card.card_name}
                className="h-30 w-45 md:h-56 md:w-94 mx-auto"
                width={376}
                height={224}
              />
            </div>

            <div className="w-full px-12">
              <div className="items-stretch">
                {(card.approved_count || 0) > 0 ? (
                  <>
                    <h3 className="text-lg leading-6 font-medium text-gray-900 text-center">
                      On average people who got <b>accepted</b> for the card had...
                    </h3>

                    <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3 text-center">
                      <div className="py-5 bg-white shadow rounded-lg overflow-hidden sm:min-w-min">
                        <dt className="text-sm font-medium text-gray-500 truncate">Credit Score</dt>
                        <dd className="mt-1 text-3xl font-semibold text-gray-900">
                          {card.approved_median_credit_score}
                        </dd>
                      </div>
                      <div className="py-5 bg-white shadow rounded-lg overflow-hidden sm:min-w-min">
                        <dt className="text-sm font-medium text-gray-500 truncate">Income</dt>
                        <dd className="mt-1 text-3xl font-semibold text-gray-900">
                          ${card.approved_median_income?.toLocaleString()}
                        </dd>
                      </div>
                      <div className="py-5 bg-white shadow rounded-lg overflow-hidden sm:min-w-min">
                        <dt className="text-sm font-medium text-gray-500 truncate">Length of Credit</dt>
                        <dd className="mt-1 text-3xl font-semibold text-gray-900">
                          {card.approved_median_length_credit}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-center text-xs text-gray-400 pt-6">
                      Median based on {(card.rejected_count || 0) + (card.approved_count || 0)} records
                      with {card.approved_count} approved and {card.rejected_count} rejected
                    </p>
                  </>
                ) : (
                  <div className="py-8 bg-blue-50 rounded-lg">
                    <div className="text-center px-6">
                      <h3 className="text-lg leading-6 font-medium text-gray-900 mb-3">
                        We're still collecting data on this card
                      </h3>
                      <p className="text-base text-gray-600">
                        If you've applied for this card, please submit your data below. We need at least 1 data point to show the charts and statistics.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-indigo-50">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:py-24 lg:px-8 lg:flex lg:items-center lg:justify-between">
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">
            <span className="block">Have you applied for this card?</span>
            <span className="block text-indigo-600">Let others know your experience.</span>
          </h2>
          <div className="mt-8 flex lg:mt-0 lg:flex-shrink-0">
            <div className="inline-flex rounded-md shadow">
              {authState.isAuthenticated ? (
                <button
                  onClick={() => setShowModal(true)}
                  className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Submit
                </button>
              ) : (
                <button
                  disabled
                  className="cursor-not-allowed inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-gray-300"
                >
                  Log In to Submit
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section - only show if there's data */}
      {(chartOne.length > 0 || chartThree.length > 0) && (
      <div className="py-12">
        <div className="max-w-full mx-auto sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-indigo-600 font-semibold tracking-wide uppercase">
              DATA POINTS
            </h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              How other people did
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              User reported results when applying for the {card.card_name} over the past year.
            </p>
          </div>

          {chartOne.length > 0 && (
            <div className="mt-10 mb-10 flex flex-wrap">
              <div className="sm:mx-2 bg-white shadow overflow-hidden sm:rounded-lg sm:min-w-0 sm:w-5/12 min-w-full flex-auto">
                <div className="px-1 py-5 sm:px-6">
                  <ErrorBoundary fallback={<ChartErrorFallback />}>
                    <ScatterPlot
                      title="Credit Score vs Income"
                      yAxis="Income (USD)"
                      xAxis="Credit Score"
                      series={[
                        { name: "Accepted", color: "#71AC49", data: chartOne[0] || [] },
                        { name: "Rejected", color: "#e53936", data: chartOne[1] || [] },
                      ]}
                    />
                  </ErrorBoundary>
                </div>
              </div>
              <div className="sm:mx-2 bg-white shadow overflow-hidden sm:rounded-lg sm:min-w-0 sm:w-5/12 min-w-full flex-auto">
                <div className="px-4 py-5 sm:px-6">
                  <ErrorBoundary fallback={<ChartErrorFallback />}>
                    <ScatterPlot
                      title="Length of Credit vs Credit Score"
                      yAxis="Credit Score"
                      xAxis="Length of Credit (Year)"
                      series={[
                        { name: "Accepted", color: "#71AC49", data: chartTwo[0] || [] },
                        { name: "Rejected", color: "#e53936", data: chartTwo[1] || [] },
                      ]}
                    />
                  </ErrorBoundary>
                </div>
              </div>
            </div>
          )}
        </div>

        {chartThree.length > 0 && (
          <div className="bg-gray-50 overflow-hidden">
            <div className="relative max-w-7xl mx-auto py-12 sm:px-6 lg:px-8">
              <div className="relative lg:grid lg:grid-cols-3 lg:gap-x-8">
                <div className="lg:col-span-1">
                  <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                    For people who got approved...
                  </h2>
                </div>
                <div className="mt-10 sm:mx-2 bg-white shadow overflow-hidden sm:rounded-lg lg:col-span-2">
                  <div className="sm:px-6 py-5">
                    <ErrorBoundary fallback={<ChartErrorFallback />}>
                      <ScatterPlot
                        title="Starting Credit Limit vs Income"
                        yAxis="Starting Credit Limit (USD)"
                        xAxis="Income (USD)"
                        series={[
                          { name: "Accepted", color: "rgba(76, 74, 220, .5)", data: chartThree[0] || [] },
                        ]}
                      />
                    </ErrorBoundary>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Submit Record Modal */}
      <SubmitRecordModal
        show={showModal}
        handleClose={() => setShowModal(false)}
        card={card}
        onSuccess={handleSubmitSuccess}
      />
    </div>
  );
}
