'use client';

import { useState, useMemo, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BuildingLibraryIcon } from "@heroicons/react/24/solid";
import { ExclamationTriangleIcon, PencilSquareIcon, NewspaperIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/auth/AuthProvider";
import { Card, GraphData, Reward, trackReferralEvent } from "@/lib/api";
import { NewsItem, tagLabels, tagColors } from "@/lib/news";
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

const categoryLabels: Record<string, string> = {
  dining: "Dining",
  groceries: "Groceries",
  travel: "Travel",
  gas: "Gas",
  streaming: "Streaming",
  transit: "Transit",
  drugstores: "Drugstores",
  home_improvement: "Home Improvement",
  online_shopping: "Online Shopping",
  hotels: "Hotels",
  airlines: "Airlines",
  car_rentals: "Car Rentals",
  entertainment: "Entertainment",
  rotating: "Rotating Categories",
  travel_portal: "Travel (via Portal)",
  hotels_portal: "Hotels (via Portal)",
  flights_portal: "Flights (via Portal)",
  hotels_car_portal: "Hotels & Car Rentals (via Portal)",
  amazon: "Amazon.com",
  everything_else: "Everything Else",
};

function formatRewardValue(reward: Reward): string {
  if (reward.unit === "percent") {
    return `${reward.value}%`;
  }
  return `${reward.value}x`;
}

interface CardClientProps {
  card: Card;
  graphData: GraphData[];
  news: NewsItem[];
}

export default function CardClient({ card, graphData, news }: CardClientProps) {
  const [showModal, setShowModal] = useState(false);
  const { authState } = useAuth();
  const router = useRouter();

  const chartOne = graphData[0] || [];
  const chartTwo = graphData[1] || [];
  const chartThree = graphData[2] || [];

  // Randomly select a referral if available
  const selectedReferral = useMemo(() => {
    if (card.referrals && card.referrals.length > 0) {
      const randomIndex = Math.floor(Math.random() * card.referrals.length);
      return card.referrals[randomIndex];
    }
    return null;
  }, [card.referrals]);

  // Build full referral URL
  const randomReferralUrl = useMemo(() => {
    if (selectedReferral) {
      return selectedReferral.referral_link;
    }
    return null;
  }, [selectedReferral]);

  // Track impression when referral is shown
  const impressionTracked = useRef(false);
  useEffect(() => {
    if (selectedReferral && !impressionTracked.current) {
      impressionTracked.current = true;
      trackReferralEvent(selectedReferral.referral_id, 'impression').catch(() => {
        // Silently fail - tracking shouldn't break the page
      });
    }
  }, [selectedReferral]);

  // Handle referral click
  const handleReferralClick = () => {
    if (selectedReferral) {
      trackReferralEvent(selectedReferral.referral_id, 'click').catch(() => {
        // Silently fail
      });
    }
  };

  // Check if charts have actual data points (not just empty structure)
  const hasChartOneData = chartOne.some(series => Array.isArray(series) && series.length > 0);
  const hasChartThreeData = chartThree.some(series => Array.isArray(series) && series.length > 0);

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
        { name: card.card_name, url: `https://creditodds.com/card/${card.slug}` }
      ]} />
      {/* Breadcrumbs */}
      <nav className="bg-white border-b border-gray-200" aria-label="Breadcrumb">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
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
          {card.slug && (
            <a
              href={`https://github.com/CreditOdds/creditodds/edit/main/data/cards/${card.slug}.yaml`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center text-xs text-gray-400 hover:text-indigo-600"
            >
              <PencilSquareIcon className="h-3.5 w-3.5 mr-1" />
              Edit this page
            </a>
          )}
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
          {/* Card Header & Info Section */}
          <div className="sm:flex sm:items-start pt-6 pb-6 sm:pt-14 sm:pb-10">
            {/* Card Image - Left side */}
            <div className="mb-4 flex-shrink-0 sm:mb-0 sm:mr-8">
              <Image
                src={card.card_image_link
                  ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                  : '/assets/generic-card.svg'}
                alt={card.card_name}
                className="h-30 w-45 md:h-56 md:w-94 mx-auto sm:mx-0"
                width={376}
                height={224}
                priority
                sizes="(max-width: 768px) 180px, 376px"
              />
              {/* Apply Buttons under card image */}
              {card.accepting_applications && (card.apply_link || randomReferralUrl) && (
                <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center sm:justify-start">
                  {card.apply_link && (
                    <a
                      href={card.apply_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                    >
                      Apply Now
                    </a>
                  )}
                  {randomReferralUrl && (
                    <a
                      href={randomReferralUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleReferralClick}
                      className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white transition-colors animate-shimmer bg-[length:200%_100%]"
                      style={{
                        backgroundImage: 'linear-gradient(110deg, #5b21b6 0%, #6d28d9 45%, #8b5cf6 55%, #6d28d9 100%)',
                      }}
                    >
                      Apply with Referral
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Card Details - Right side */}
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl sm:text-4xl font-extrabold text-gray-900 tracking-wide">
                {card.card_name}
              </h1>

              {/* Compact metadata row */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-2 gap-y-1 mt-2 text-sm text-gray-500">
                <Link href={`/bank/${encodeURIComponent(card.bank)}`} className="inline-flex items-center group">
                  <BuildingLibraryIcon className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 mr-1" aria-hidden="true" />
                  <span className="group-hover:text-indigo-600">{card.bank}</span>
                </Link>
                {card.annual_fee !== undefined && (
                  <>
                    <span className="text-gray-300">&middot;</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      card.annual_fee === 0
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-100 text-gray-700"
                    }`}>
                      {card.annual_fee === 0 ? "$0 Annual Fee" : `$${card.annual_fee.toLocaleString()} Annual Fee`}
                    </span>
                  </>
                )}
                {card.reward_type && (
                  <>
                    <span className="text-gray-300">&middot;</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      card.reward_type === 'cashback'
                        ? "bg-green-50 text-green-700"
                        : card.reward_type === 'points'
                          ? "bg-blue-50 text-blue-700"
                          : "bg-purple-50 text-purple-700"
                    }`}>
                      {card.reward_type === 'cashback' ? 'Cashback' : card.reward_type === 'points' ? 'Points' : 'Miles'}
                    </span>
                  </>
                )}
              </div>

              {/* Rewards + Signup Bonus Card */}
              {(card.rewards && card.rewards.length > 0 || card.signup_bonus) && (
                <div className="mt-4 bg-white shadow rounded-lg overflow-hidden">
                  {card.rewards && card.rewards.length > 0 && (
                    <div className="p-4">
                      <p className="text-xs uppercase text-gray-500 font-semibold mb-2 tracking-wide">Rewards</p>
                      <div className="flex flex-wrap gap-2">
                        {card.rewards.map((reward) => (
                          <span
                            key={reward.category}
                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium ${
                              reward.category === "everything_else"
                                ? "bg-gray-100 text-gray-700"
                                : "bg-indigo-50 text-indigo-700"
                            }`}
                          >
                            {formatRewardValue(reward)} {categoryLabels[reward.category] || reward.category}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {card.signup_bonus && (
                    <div className={`bg-amber-50 px-4 py-3 border-t border-amber-100 ${
                      !(card.rewards && card.rewards.length > 0) ? "rounded-t-lg" : ""
                    }`}>
                      <p className="text-sm font-medium text-amber-900">
                        Earn{" "}
                        <span className="font-bold">
                          {card.signup_bonus.type === "cash"
                            ? `$${card.signup_bonus.value.toLocaleString()}`
                            : `${card.signup_bonus.value.toLocaleString()} ${card.signup_bonus.type}`}
                        </span>{" "}
                        after spending ${card.signup_bonus.spend_requirement.toLocaleString()} in{" "}
                        {card.signup_bonus.timeframe_months} month{card.signup_bonus.timeframe_months !== 1 ? "s" : ""}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Stats Section */}
              <div className="mt-6">
              <div className="items-stretch">
                {(card.approved_count || 0) > 0 ? (
                  <>
                    <h3 className="text-lg leading-6 font-medium text-gray-900 text-center sm:text-left mb-4">
                      The median applicant who got <b>accepted</b> for the card had...
                    </h3>

                    <div className="bg-white shadow rounded-lg overflow-hidden">
                      <dl className="grid grid-cols-3 divide-x divide-gray-200">
                        <div className="px-2 py-3 sm:px-4 sm:py-5 text-center">
                          <dt className="text-xs sm:text-sm font-medium text-gray-500">Credit Score</dt>
                          <dd className="mt-1 text-xl sm:text-3xl font-semibold text-gray-900">
                            {card.approved_median_credit_score}
                          </dd>
                        </div>
                        <div className="px-2 py-3 sm:px-4 sm:py-5 text-center">
                          <dt className="text-xs sm:text-sm font-medium text-gray-500">Income</dt>
                          <dd className="mt-1 text-xl sm:text-3xl font-semibold text-gray-900">
                            ${card.approved_median_income?.toLocaleString()}
                          </dd>
                        </div>
                        <div className="px-2 py-3 sm:px-4 sm:py-5 text-center">
                          <dt className="text-xs sm:text-sm font-medium text-gray-500">Credit Length</dt>
                          <dd className="mt-1 text-xl sm:text-3xl font-semibold text-gray-900">
                            {card.approved_median_length_credit}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <p className="mt-3 text-center sm:text-left text-xs text-gray-400">
                      Median based on {(card.rejected_count || 0) + (card.approved_count || 0)} records
                      with <span className="text-green-600">{card.approved_count} approved</span> and <span className="text-red-600">{card.rejected_count} rejected</span>
                    </p>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* CTA Section - only show for cards accepting applications */}
      {card.accepting_applications && (
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
      )}

      {/* Still collecting data - shown below CTA when no approval data */}
      {(card.approved_count || 0) === 0 && card.accepting_applications && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="py-8 bg-blue-50 rounded-lg">
            <div className="text-center px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-3">
                We&apos;re still collecting data on this card
              </h3>
              <p className="text-base text-gray-600">
                If you&apos;ve applied for this card, please submit your data above. We need at least 1 data point to show the charts and statistics.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Charts Section - only show if there's actual data points */}
      {(hasChartOneData || hasChartThreeData) && (
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
              User reported results when applying for the {card.card_name}.
            </p>
          </div>

          {hasChartOneData && (
            <div className="mt-10 mb-10 flex flex-wrap">
              <div className="sm:mx-2 bg-white shadow overflow-hidden sm:rounded-lg sm:min-w-0 sm:w-5/12 min-w-full flex-auto">
                <div className="px-1 py-5 sm:px-6">
                  <ErrorBoundary fallback={<ChartErrorFallback />}>
                    <ScatterPlot
                      title="Credit Score vs Income"
                      yAxis="Income (USD)"
                      xAxis="Credit Score"
                      yPrefix="$"
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
                      xSuffix=" yr"
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

        {hasChartThreeData && (
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
                        title="Income vs Starting Credit Limit"
                        yAxis="Starting Credit Limit (USD)"
                        xAxis="Income (USD)"
                        xPrefix="$"
                        yPrefix="$"
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

      {/* Card News Section */}
      {news.length > 0 && (
        <div className="bg-white py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-6">
              <NewspaperIcon className="h-6 w-6 text-indigo-600" />
              <h2 className="text-2xl font-bold text-gray-900">
                {card.card_name} News
              </h2>
            </div>
            <div className="space-y-4">
              {news.map((item) => (
                <div key={item.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-sm text-gray-500">
                      {new Date(item.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tagColors[tag]}`}
                      >
                        {tagLabels[tag]}
                      </span>
                    ))}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {item.body ? (
                      <Link href={`/news/${item.id}`} className="hover:text-indigo-600 transition-colors">
                        {item.title}
                      </Link>
                    ) : (
                      item.title
                    )}
                  </h3>
                  <p className="text-gray-600">{item.summary}</p>
                  {item.source_url && (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      Read more →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Apply Section */}
      {card.accepting_applications && (card.apply_link || randomReferralUrl) && (
        <div className="bg-gray-100 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Ready to apply for the {card.card_name}?
            </h2>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {card.apply_link && (
                <a
                  href={card.apply_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-lg"
                >
                  Apply Now
                </a>
              )}
              {randomReferralUrl && (
                <a
                  href={randomReferralUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleReferralClick}
                  className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white shadow-lg animate-shimmer bg-[length:200%_100%]"
                  style={{
                    backgroundImage: 'linear-gradient(110deg, #5b21b6 0%, #6d28d9 45%, #8b5cf6 55%, #6d28d9 100%)',
                  }}
                >
                  Apply with Referral
                </a>
              )}
            </div>
            {randomReferralUrl && (
              <p className="mt-3 text-sm text-gray-500">
                Using a referral link helps support our community members
              </p>
            )}
          </div>
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
