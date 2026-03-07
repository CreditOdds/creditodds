'use client';

import { useState, useMemo, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BuildingLibraryIcon,
} from "@heroicons/react/24/solid";
import { getValuation } from "@/lib/valuations";
import {
  ExclamationTriangleIcon,
  PencilSquareIcon,
  NewspaperIcon,
  XMarkIcon,
  InformationCircleIcon,
  BanknotesIcon,
  ScaleIcon,
  WalletIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/auth/AuthProvider";
import { Card, GraphData, Reward, trackReferralEvent, getRecords, getCardRatings, getUserCardRating, submitCardRating, getWallet, addToWallet } from "@/lib/api";
import { NewsItem, tagLabels, tagColors } from "@/lib/news";
import { Article, tagLabels as articleTagLabels, tagColors as articleTagColors } from "@/lib/articles";
import SubmitRecordModal from "@/components/forms/SubmitRecordModal";
import { CreditCardSchema, BreadcrumbSchema } from "@/components/seo/JsonLd";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { categoryLabels, CategoryIcon } from "@/lib/cardDisplayUtils";

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

function formatRewardValue(reward: Reward): string {
  if (reward.unit === "percent") {
    return `${reward.value}%`;
  }
  return `${reward.value}x`;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Very Bad',
  2: 'Bad',
  3: 'Good',
  4: 'Very Good',
};

const RATING_COLORS: Record<number, { bg: string; text: string; fill: string }> = {
  1: { bg: 'bg-red-100', text: 'text-red-700', fill: 'text-red-400' },
  2: { bg: 'bg-orange-100', text: 'text-orange-700', fill: 'text-orange-400' },
  3: { bg: 'bg-green-100', text: 'text-green-700', fill: 'text-green-400' },
  4: { bg: 'bg-emerald-100', text: 'text-emerald-700', fill: 'text-emerald-500' },
};

function StarIcon({ filled, half, className }: { filled?: boolean; half?: boolean; className?: string }) {
  if (half) {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="halfGrad">
            <stop offset="50%" stopColor="currentColor" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
        <path
          d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
          fill="url(#halfGrad)"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? "0" : "1.5"} xmlns="http://www.w3.org/2000/svg">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function CardRating({ cardName, dbCardId, isAuthenticated, getToken }: {
  cardName: string;
  dbCardId?: number;
  isAuthenticated: boolean;
  getToken: () => Promise<string | null>;
}) {
  const [aggregate, setAggregate] = useState<{ count: number; average: number | null }>({ count: 0, average: null });
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inWallet, setInWallet] = useState<boolean | null>(null);
  const [showWalletPrompt, setShowWalletPrompt] = useState(false);
  const [addingToWallet, setAddingToWallet] = useState(false);
  const [walletAdded, setWalletAdded] = useState(false);

  useEffect(() => {
    getCardRatings(cardName).then(setAggregate).catch(() => {});
  }, [cardName]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      const [rating, wallet] = await Promise.all([
        getUserCardRating(cardName, token),
        getWallet(token).catch(() => []),
      ]);
      if (cancelled) return;
      setUserRating(rating);
      setInWallet(wallet.some(w => w.card_name === cardName));
    })();
    return () => { cancelled = true; };
  }, [cardName, isAuthenticated, getToken]);

  const handleRate = async (rating: number) => {
    if (!isAuthenticated || submitting) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;
      await submitCardRating(cardName, rating, token);
      setUserRating(rating);
      const updated = await getCardRatings(cardName);
      setAggregate(updated);
      // Show wallet prompt if card isn't in wallet
      if (inWallet === false && !walletAdded) {
        setShowWalletPrompt(true);
      }
    } catch {
      // Silently fail
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToWallet = async () => {
    if (!dbCardId || addingToWallet) return;
    setAddingToWallet(true);
    try {
      const token = await getToken();
      if (!token) return;
      await addToWallet(dbCardId, undefined, undefined, token);
      setWalletAdded(true);
      setInWallet(true);
      setShowWalletPrompt(false);
    } catch {
      // Silently fail
    } finally {
      setAddingToWallet(false);
    }
  };

  const displayRating = hoveredRating ?? userRating;
  const ratingStyle = displayRating ? RATING_COLORS[displayRating] : null;

  return (
    <div className="mt-6 w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase text-gray-400 font-semibold tracking-wider">User Rating</p>
        {aggregate.count > 0 && aggregate.average !== null && (
          <span className="text-sm text-gray-500">
            {aggregate.average.toFixed(1)}/4 from {aggregate.count} {aggregate.count === 1 ? 'rating' : 'ratings'}
          </span>
        )}
      </div>

      {/* Star display for aggregate */}
      {aggregate.count > 0 && aggregate.average !== null && (
        <div className="flex items-center gap-0.5 mb-3">
          {[1, 2, 3, 4].map((star) => {
            const filled = star <= Math.floor(aggregate.average!);
            const half = !filled && star === Math.ceil(aggregate.average!) && aggregate.average! % 1 >= 0.25;
            return (
              <StarIcon
                key={star}
                filled={filled}
                half={half}
                className={`h-5 w-5 ${filled || half ? 'text-amber-400' : 'text-gray-300'}`}
              />
            );
          })}
        </div>
      )}

      {/* Interactive rating for signed-in users */}
      {isAuthenticated ? (
        <div>
          <p className="text-sm text-gray-600 mb-2">
            {userRating ? 'Your rating (click to change):' : 'Rate this card:'}
          </p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4].map((star) => {
              const active = (hoveredRating ?? userRating ?? 0) >= star;
              const colors = RATING_COLORS[hoveredRating ?? userRating ?? star];
              return (
                <button
                  key={star}
                  onClick={() => handleRate(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(null)}
                  disabled={submitting}
                  className={`p-1.5 rounded-lg transition-colors ${
                    active ? colors.bg : 'hover:bg-gray-100'
                  } ${submitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  title={RATING_LABELS[star]}
                >
                  <StarIcon
                    filled={active}
                    className={`h-7 w-7 ${active ? colors.fill : 'text-gray-300'}`}
                  />
                </button>
              );
            })}
            {displayRating && ratingStyle && (
              <span className={`ml-2 text-sm font-medium ${ratingStyle.text}`}>
                {RATING_LABELS[displayRating]}
              </span>
            )}
          </div>

          {/* Add to wallet prompt */}
          {showWalletPrompt && dbCardId && (
            <div className="mt-3 flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
              <WalletIcon className="h-4 w-4 text-indigo-500 flex-shrink-0" />
              <span className="text-sm text-indigo-700 flex-1">Add this card to your wallet?</span>
              <button
                onClick={handleAddToWallet}
                disabled={addingToWallet}
                className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 rounded-md disabled:opacity-50"
              >
                {addingToWallet ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => setShowWalletPrompt(false)}
                className="text-indigo-400 hover:text-indigo-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Wallet added confirmation */}
          {walletAdded && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
              <CheckIcon className="h-4 w-4" />
              Added to your wallet
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400">
          Sign in to rate this card
        </p>
      )}
    </div>
  );
}

interface CardClientProps {
  card: Card;
  graphData: GraphData[];
  news: NewsItem[];
  articles: Article[];
}

export default function CardClient({ card, graphData, news, articles }: CardClientProps) {
  const [showModal, setShowModal] = useState(false);
  const [hasSubmittedForCard, setHasSubmittedForCard] = useState<boolean | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const dismissed = localStorage.getItem('nudge_dismissed');
    return dismissed === new Date().toISOString().slice(0, 10);
  });
  const { authState, getToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auto-open submit modal when ?submit=true is present
  useEffect(() => {
    if (searchParams.get('submit') === 'true' && authState.isAuthenticated) {
      setShowModal(true);
      router.replace(`/card/${card.slug}`, { scroll: false });
    }
  }, [searchParams, authState.isAuthenticated, card.slug, router]);

  // Check if user has already submitted a record for this card
  useEffect(() => {
    if (!authState.isAuthenticated || !card.accepting_applications) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const records = await getRecords(token);
        if (cancelled) return;
        const submitted = records.some(
          (r: { card_name: string }) => r.card_name === card.card_name
        );
        setHasSubmittedForCard(submitted);
      } catch {
        // Silently fail
      }
    })();
    return () => { cancelled = true; };
  }, [authState.isAuthenticated, getToken, card.card_name, card.accepting_applications]);

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
    setHasSubmittedForCard(true);
    router.refresh();
  };

  // Format credit length with "Years" unit
  const formatCreditLength = (value: string | number | undefined) => {
    if (value === undefined || value === null) return { number: "—", unit: "" };
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return { number: String(value), unit: "" };
    return { number: String(num), unit: num === 1 ? "Year" : "Years" };
  };

  const creditLength = formatCreditLength(card.approved_median_length_credit);

  return (
    <div className="bg-gray-50 min-h-screen">
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
          <ol className="flex items-center space-x-4 py-4 overflow-hidden">
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
                <span className="ml-4 text-sm font-medium text-gray-500 truncate">{card.card_name}</span>
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

      {/* Contextual nudge for users who haven't submitted for this card */}
      {card.accepting_applications && authState.isAuthenticated && hasSubmittedForCard === false && !nudgeDismissed && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 lg:px-8 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <p className="text-sm text-amber-800">
              You haven&apos;t shared your result for this card yet.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowModal(true)}
                className="flex-shrink-0 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 px-3 py-1.5 rounded-md transition-colors"
              >
                Submit now
              </button>
              <button
                onClick={() => {
                  localStorage.setItem('nudge_dismissed', new Date().toISOString().slice(0, 10));
                  setNudgeDismissed(true);
                }}
                className="flex-shrink-0 p-1 text-amber-400 hover:text-amber-600 transition-colors"
                aria-label="Dismiss"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Main Content Card */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="bg-white rounded-2xl shadow-[0_4px_40px_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="p-6 sm:p-10">
            {/* Compare link */}
            <div className="flex justify-end mb-4">
              <Link
                href={`/compare?cards=${card.slug}`}
                className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-indigo-600 transition-colors"
              >
                <ScaleIcon className="h-4 w-4" />
                Compare
              </Link>
            </div>
            {/* Two-column layout */}
            <div className="lg:grid lg:grid-cols-12 lg:gap-12">

              {/* Left Column - Card Image & Signup Bonus */}
              <div className="lg:col-span-4 flex flex-col items-center">
                {/* Card Image */}
                <div className="w-full max-w-sm lg:max-w-[330px] mx-auto lg:mx-0">
                  <Image
                    src={card.card_image_link
                      ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                      : '/assets/generic-card.svg'}
                    alt={card.card_name}
                    className="w-full rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.2)]"
                    width={360}
                    height={227}
                    priority
                    sizes="(max-width: 768px) 75vw, (max-width: 1024px) 40vw, 330px"
                  />
                </div>

                {/* Signup Bonus Card - below image */}
                {card.signup_bonus && (
                  <div className="mt-6 w-full bg-gradient-to-br from-amber-50 to-amber-100/80 border border-amber-200/60 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 p-2 bg-amber-200/50 rounded-lg">
                        <BanknotesIcon className="h-5 w-5 text-amber-700" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-1">Signup Bonus</p>
                        <p className="text-xl font-bold text-amber-900">
                          {card.signup_bonus.type === "cash"
                            ? `$${card.signup_bonus.value.toLocaleString()}`
                            : `${card.signup_bonus.value.toLocaleString()} ${card.signup_bonus.type.charAt(0).toUpperCase() + card.signup_bonus.type.slice(1)}`}
                          {card.signup_bonus.type !== "cash" && (
                            <span className="text-sm font-medium text-amber-700/70 ml-1.5">
                              (~${(card.signup_bonus.value * getValuation(card.card_name) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-amber-800/70 mt-1">
                          After spending ${card.signup_bonus.spend_requirement.toLocaleString()} in{" "}
                          {card.signup_bonus.timeframe_months} month{card.signup_bonus.timeframe_months !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Card Rating */}
                <CardRating
                  cardName={card.card_name}
                  dbCardId={typeof card.card_id === 'number' ? card.card_id : undefined}
                  isAuthenticated={authState.isAuthenticated}
                  getToken={getToken}
                />

                {/* Apply Buttons */}
                {card.accepting_applications && (card.apply_link || randomReferralUrl) && (
                  <div className="mt-5 w-full flex flex-col gap-2.5">
                    {card.apply_link && (
                      <a
                        href={card.apply_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-5 py-3.5 border border-transparent text-sm font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
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
                        className="inline-flex items-center justify-center px-5 py-3.5 border border-transparent text-sm font-semibold rounded-xl text-white transition-colors shadow-sm animate-shimmer bg-[length:200%_100%]"
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

              {/* Right Column - Details */}
              <div className="lg:col-span-8 mt-8 lg:mt-0">
                {/* Title */}
                <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight text-center lg:text-left">
                  {card.card_name}
                </h1>

                {/* Metadata Row */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-3 gap-y-2 mt-3">
                  <Link href={`/bank/${encodeURIComponent(card.bank)}`} className="inline-flex items-center group">
                    <BuildingLibraryIcon className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 mr-1" aria-hidden="true" />
                    <span className="text-sm text-gray-600 group-hover:text-indigo-600 font-medium">{card.bank}</span>
                  </Link>
                  {card.annual_fee !== undefined && (
                    <>
                      <span className="text-gray-300">&middot;</span>
                      <span className="text-sm text-gray-600 font-medium">
                        {card.annual_fee === 0 ? "$0 Annual Fee" : `$${card.annual_fee.toLocaleString()} Annual Fee`}
                      </span>
                    </>
                  )}
                  {card.reward_type && (
                    <>
                      <span className="text-gray-300">&middot;</span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        card.reward_type === 'cashback'
                          ? "border-green-200 text-green-700 bg-green-50/50"
                          : card.reward_type === 'points'
                            ? "border-blue-200 text-blue-700 bg-blue-50/50"
                            : "border-purple-200 text-purple-700 bg-purple-50/50"
                      }`}>
                        {card.reward_type === 'cashback' ? 'Cashback' : card.reward_type === 'points' ? 'Points' : 'Miles'}
                      </span>
                    </>
                  )}
                </div>

                {/* Rewards Section - 2-column grid, sorted highest first */}
                {card.rewards && card.rewards.length > 0 && (() => {
                  // Sort rewards by value descending
                  const sorted = [...card.rewards].sort((a, b) => b.value - a.value);
                  // Split into 2 columns (column-major: fill left column top-down, then right)
                  const mid = Math.ceil(sorted.length / 2);
                  const leftCol = sorted.slice(0, mid);
                  const rightCol = sorted.slice(mid);

                  const rewardTypeLabel = card.reward_type === 'cashback' ? 'Cashback' : card.reward_type === 'miles' ? 'Miles' : 'Points';

                  const renderReward = (reward: Reward) => {
                    const label = reward.category === "rotating" && reward.mode
                      ? reward.mode === "quarterly_rotating"
                        ? "Rotating Categories"
                        : reward.mode === "user_choice"
                          ? `Choose ${reward.choices || ''} Categories`
                          : reward.mode === "auto_top_spend"
                            ? "Top Spend Category"
                            : categoryLabels[reward.category] || reward.category
                      : categoryLabels[reward.category] || reward.category;

                    return (
                      <div key={reward.category} className="flex items-center gap-2.5 py-1.5">
                        <span className={`flex-shrink-0 ${
                          reward.category === "everything_else" ? "text-gray-300" : "text-indigo-500"
                        }`}>
                          <CategoryIcon category={reward.category} className="h-5 w-5" />
                        </span>
                        <span className={`text-base font-bold flex-shrink-0 tabular-nums ${
                          reward.category === "everything_else" ? "text-gray-400" : "text-indigo-600"
                        }`}>
                          {formatRewardValue(reward)}
                        </span>
                        <span className={`text-sm text-gray-400 flex-shrink-0`}>
                          {reward.unit === "percent" ? "Cashback" : rewardTypeLabel}
                        </span>
                        <span className={`text-sm leading-tight ${
                          reward.category === "everything_else" ? "text-gray-500" : "text-gray-700"
                        }`}>
                          {label}
                        </span>
                        {reward.note && (
                          <span className="relative group">
                            <InformationCircleIcon className="h-3.5 w-3.5 text-gray-300 hover:text-gray-500 cursor-help" />
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                              {reward.note}
                            </span>
                          </span>
                        )}
                      </div>
                    );
                  };

                  return (
                    <div className="mt-6">
                      <p className="text-xs uppercase text-gray-400 font-semibold tracking-wider mb-2">Rewards</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                        <div>{leftCol.map(renderReward)}</div>
                        <div>{rightCol.map(renderReward)}</div>
                      </div>
                      {/* Rotating category details */}
                      {card.rewards.filter(r => r.category === "rotating" && r.mode).map((reward) => (
                        <div key={`${reward.category}-detail`} className="text-xs text-gray-400 mt-2 pl-[2.875rem]">
                          {reward.mode === "quarterly_rotating" && reward.current_categories && reward.current_period && (
                            <span>
                              {reward.current_period}: {reward.current_categories.map(c => categoryLabels[c] || c).join(', ')}
                            </span>
                          )}
                          {(reward.mode === "user_choice" || reward.mode === "auto_top_spend") && reward.eligible_categories && (
                            <span>
                              Eligible: {reward.eligible_categories.map(c => categoryLabels[c] || c).join(', ')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Intro APR Section */}
                {card.apr && (card.apr.purchase_intro || card.apr.balance_transfer_intro) && (
                  <div className="mt-6 bg-cyan-50/50 border border-cyan-100 rounded-xl px-5 py-4">
                    <p className="text-xs uppercase text-cyan-600 font-semibold tracking-wider mb-2">Intro APR</p>
                    <div className="text-sm text-cyan-900">
                      {card.apr.balance_transfer_intro && (
                        <p>
                          <span className="font-bold">{card.apr.balance_transfer_intro.rate}%</span> for {card.apr.balance_transfer_intro.months} months on balance transfers
                        </p>
                      )}
                      {card.apr.purchase_intro && (
                        <p className={card.apr.balance_transfer_intro ? "mt-1" : ""}>
                          <span className="font-bold">{card.apr.purchase_intro.rate}%</span> for {card.apr.purchase_intro.months} months on purchases
                        </p>
                      )}
                    </div>
                    {card.apr.regular && (
                      <p className="text-xs text-cyan-500 mt-2">
                        Then {card.apr.regular.min}%&ndash;{card.apr.regular.max}% variable APR
                      </p>
                    )}
                  </div>
                )}

                {/* Acceptance Odds Dashboard - inside right column */}
                {(card.approved_count || 0) > 0 && (
                  <div className="mt-6 bg-slate-50 border border-slate-200/80 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Median Accepted Applicant
                      </h3>
                      <span className="relative group">
                        <InformationCircleIcon className="h-4 w-4 text-gray-300 hover:text-gray-500 cursor-help" />
                        <span className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          Based on {(card.rejected_count || 0) + (card.approved_count || 0)} records
                          — {card.approved_count} approved, {card.rejected_count || 0} rejected
                        </span>
                      </span>
                    </div>
                    <dl className="grid grid-cols-3 divide-x divide-slate-200">
                      <div className="text-center px-2">
                        <dt className="text-xs font-medium text-gray-400 mb-1">Credit Score</dt>
                        <dd className="text-2xl sm:text-3xl font-bold text-gray-900">
                          {card.approved_median_credit_score}
                        </dd>
                      </div>
                      <div className="text-center px-2">
                        <dt className="text-xs font-medium text-gray-400 mb-1">Income</dt>
                        <dd className="text-2xl sm:text-3xl font-bold text-gray-900">
                          ${card.approved_median_income?.toLocaleString()}
                        </dd>
                      </div>
                      <div className="text-center px-2">
                        <dt className="text-xs font-medium text-gray-400 mb-1">Credit History</dt>
                        <dd className="text-2xl sm:text-3xl font-bold text-gray-900">
                          {creditLength.number}
                        </dd>
                        {creditLength.unit && (
                          <dd className="text-xs text-gray-400 font-medium -mt-0.5">{creditLength.unit}</dd>
                        )}
                      </div>
                    </dl>
                  </div>
                )}

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

      {/* Related Articles Section */}
      {articles.length > 0 && (
        <div className="bg-white py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-6">
              <PencilSquareIcon className="h-6 w-6 text-indigo-600" />
              <h2 className="text-2xl font-bold text-gray-900">
                Articles about {card.card_name}
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`/articles/${article.slug}`}
                  className="block bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md hover:border-indigo-300 transition-all duration-200 p-5"
                >
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {article.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${articleTagColors[tag]}`}
                      >
                        {articleTagLabels[tag]}
                      </span>
                    ))}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-2">
                    {article.title}
                  </h3>
                  <p className="text-sm text-gray-600 line-clamp-2">{article.summary}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                    <span>{article.author}</span>
                    <span>{article.reading_time} min read</span>
                  </div>
                </Link>
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
