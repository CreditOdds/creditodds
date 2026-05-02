'use client';

import { useState, useMemo, useEffect, useRef, useId } from "react";
import dynamic from "next/dynamic";
import CardImage from "@/components/ui/CardImage";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ExclamationTriangleIcon,
  ScaleIcon,
  ShareIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/auth/AuthProvider";
import {
  Card,
  GraphData,
  Reward,
  trackCardApplyClick,
  trackReferralEvent,
  trackCardView,
  CardWireEntry,
} from "@/lib/api";
import { getValuationDetails } from "@/lib/valuations";
import { DEFAULT_MULTI_YEAR_CYCLE, formatBenefitValue, isMonetaryBenefit } from "@/lib/cardDisplayUtils";
import { NewsItem, NewsTag, tagLabels } from "@/lib/news";
import { Article } from "@/lib/articles";
import SubmitRecordModal from "@/components/forms/SubmitRecordModal";
import { CreditCardSchema, BreadcrumbSchema } from "@/components/seo/JsonLd";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { categoryLabels, CategoryIcon } from "@/lib/cardDisplayUtils";
import { withApplySource } from "@/lib/applyLink";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../../landing.css";

const ScatterPlot = dynamic(() => import("@/components/charts/ScatterPlot"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 256,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        color: "var(--muted)",
      }}
    >
      Loading chart…
    </div>
  ),
});

function ChartErrorFallback() {
  return (
    <div
      style={{
        height: 256,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        color: "var(--muted)",
      }}
    >
      Unable to load chart.
    </div>
  );
}

function formatRewardValue(reward: Reward): string {
  if (reward.unit === "percent") return `${reward.value}%`;
  return `${reward.value}x`;
}

function getStableReferralIndex(cardKey: string, referralCount: number): number {
  let hash = 0;
  for (let i = 0; i < cardKey.length; i++) {
    hash = (hash * 31 + cardKey.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % referralCount;
}

function StarIcon({
  fill = 1,
  size = 14,
}: {
  fill?: number;
  size?: number;
}) {
  const gradientId = useId();
  const pct = Math.max(0, Math.min(1, fill)) * 100;
  const path =
    "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset={`${pct}%`} stopColor="currentColor" stopOpacity={1} />
          <stop offset={`${pct}%`} stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path
        d={path}
        fill={`url(#${gradientId})`}
        stroke="currentColor"
        strokeWidth={1.2}
      />
    </svg>
  );
}

const FICO_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "790+", min: 790, max: 850 },
  { label: "760–789", min: 760, max: 789 },
  { label: "730–759", min: 730, max: 759 },
  { label: "700–729", min: 700, max: 729 },
  { label: "670–699", min: 670, max: 699 },
  { label: "< 670", min: 0, max: 669 },
];

function bucketize(
  pairs: [number, number][],
  buckets: { min: number; max: number }[],
): number[] {
  return buckets.map(
    (b) => pairs.filter((p) => p[0] >= b.min && p[0] <= b.max).length,
  );
}

interface CardClientProps {
  card: Card;
  graphData: GraphData[];
  news: NewsItem[];
  articles: Article[];
  ratings: { count: number; average: number | null };
  similarCards?: Card[];
  wire?: CardWireEntry[];
}

export default function CardClient({
  card,
  graphData,
  news,
  articles,
  ratings,
  similarCards = [],
  wire = [],
}: CardClientProps) {
  // ---------- State + chrome ----------
  const [showModal, setShowModal] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [activeChart, setActiveChart] = useState<"score" | "history" | "limit">("score");
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const { authState } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const cardUrl = `https://creditodds.com/card/${card.slug}`;
  const shareTitle = `${card.card_name} on CreditOdds`;
  const encodedShareTitle = encodeURIComponent(shareTitle);
  const encodedCardUrl = encodeURIComponent(cardUrl);

  useEffect(() => {
    if (
      searchParams.get("submit") === "true" &&
      authState.isAuthenticated
    ) {
      const id = window.setTimeout(() => setShowModal(true), 0);
      router.replace(`/card/${card.slug}`, { scroll: false });
      return () => window.clearTimeout(id);
    }
  }, [searchParams, authState.isAuthenticated, card.slug, router]);

  useEffect(() => {
    if (!showShareMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        shareMenuRef.current &&
        !shareMenuRef.current.contains(e.target as Node)
      ) {
        setShowShareMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showShareMenu]);

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(cardUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2000);
    } catch {
      // ignore
    }
  };

  // ---------- Tracking + referrals ----------
  const selectedReferral = useMemo(() => {
    if (card.referrals && card.referrals.length > 0) {
      const idx = getStableReferralIndex(
        `${card.card_id}:${card.slug}`,
        card.referrals.length,
      );
      return card.referrals[idx];
    }
    return null;
  }, [card.card_id, card.referrals, card.slug]);

  const randomReferralUrl = selectedReferral?.referral_link ?? null;

  const viewTracked = useRef(false);
  useEffect(() => {
    if (card.card_id && !viewTracked.current) {
      viewTracked.current = true;
      trackCardView(Number(card.card_id)).catch(() => {});
    }
  }, [card.card_id]);

  const impressionTracked = useRef(false);
  useEffect(() => {
    if (selectedReferral && !impressionTracked.current) {
      impressionTracked.current = true;
      trackReferralEvent(selectedReferral.referral_id, "impression").catch(
        () => {},
      );
    }
  }, [selectedReferral]);

  const handleCardApplyClick = (clickSource: "direct" | "referral") => {
    const cardId = Number(card.card_id);
    if (Number.isInteger(cardId) && cardId > 0) {
      trackCardApplyClick(cardId, clickSource).catch(() => {});
    }
  };

  const handleReferralClick = () => {
    if (selectedReferral) {
      trackReferralEvent(selectedReferral.referral_id, "click").catch(
        () => {},
      );
    }
    handleCardApplyClick("referral");
  };

  const handleSubmitSuccess = () => router.refresh();

  // ---------- Computed ----------
  const chartOne = graphData[0] || [];
  const chartTwo = graphData[1] || [];
  const chartThree = graphData[2] || [];
  const hasChartOne = chartOne.some(
    (s) => Array.isArray(s) && s.length > 0,
  );
  const hasChartTwo = chartTwo.some(
    (s) => Array.isArray(s) && s.length > 0,
  );
  const hasChartThree = chartThree.some(
    (s) => Array.isArray(s) && s.length > 0,
  );

  const acceptedBuckets = bucketize(chartOne[0] || [], FICO_BUCKETS);
  const rejectedBuckets = bucketize(chartOne[1] || [], FICO_BUCKETS);
  const totalRecordsFromChart =
    (chartOne[0]?.length || 0) + (chartOne[1]?.length || 0);
  const maxBucketTotal = Math.max(
    1,
    ...FICO_BUCKETS.map(
      (_, i) => acceptedBuckets[i] + rejectedBuckets[i],
    ),
  );

  const sortedRewards = useMemo<Reward[]>(
    () => (card.rewards ? [...card.rewards].sort((a, b) => b.value - a.value) : []),
    [card.rewards],
  );

  const creditBenefits = (card.benefits || []).filter((b) => b.value > 0);
  // Mirrors amortizedAnnualValue() but supports unit filtering so we can
  // roll up USD / points / miles totals separately. Convention: `value` is
  // the annual total; `frequency` is just a display hint (monthly/quarterly
  // /semi_annual all return value as-is). Only multi_year amortizes by
  // dividing across `frequency_years`.
  const sumByUnit = (unit: 'usd' | 'points' | 'miles') =>
    creditBenefits.reduce((sum, b) => {
      const isUsd = !b.value_unit || b.value_unit === 'usd';
      const matches = unit === 'usd' ? isUsd : b.value_unit === unit;
      if (!matches) return sum;
      switch (b.frequency) {
        case 'monthly':
        case 'quarterly':
        case 'semi_annual':
        case 'annual':
          return sum + b.value;
        case 'multi_year': {
          const years = b.frequency_years || DEFAULT_MULTI_YEAR_CYCLE;
          return sum + Math.round(b.value / years);
        }
        // ongoing / per_purchase / per_flight / one_time / etc. — usage
        // frequency unknown, can't roll up annually.
        default: return sum;
      }
    }, 0);
  const totalCredits = sumByUnit('usd');
  const totalPoints = sumByUnit('points');
  const totalMiles = sumByUnit('miles');
  // Headline credits value, preferring USD when present, otherwise the dominant
  // non-USD unit. Returns null when there's nothing to show.
  const headlineCredits =
    totalCredits > 0
      ? `$${totalCredits.toLocaleString()}`
      : totalPoints > 0
        ? `${totalPoints.toLocaleString()} points`
        : totalMiles > 0
          ? `${totalMiles.toLocaleString()} miles`
          : null;

  const tagline = useMemo(() => {
    const parts: string[] = [];
    const sb = card.signup_bonus;
    if (sb) {
      if (sb.type === "cash") parts.push(`$${sb.value.toLocaleString()} welcome bonus`);
      else if (sb.type === "free_nights")
        parts.push(`${sb.value} free night${sb.value !== 1 ? "s" : ""}`);
      else parts.push(`${sb.value.toLocaleString()} ${sb.type} welcome`);
    }
    const top = sortedRewards[0];
    if (top) {
      const lbl = categoryLabels[top.category] || top.category;
      parts.push(`${formatRewardValue(top)} on ${lbl.toLowerCase()}`);
    }
    if (card.annual_fee !== undefined) {
      parts.push(card.annual_fee === 0 ? "$0 annual fee" : `$${card.annual_fee.toLocaleString()}/yr`);
    }
    return parts.join(" · ");
  }, [card, sortedRewards]);

  // Headline: split on last space so the closing word can take the accent color.
  const { headlineMain, headlineAccent } = useMemo(() => {
    const words = card.card_name.trim().split(/\s+/);
    if (words.length < 2) return { headlineMain: "", headlineAccent: card.card_name };
    return {
      headlineMain: words.slice(0, -1).join(" "),
      headlineAccent: words[words.length - 1],
    };
  }, [card.card_name]);

  const bonusDisplay = useMemo(() => {
    const sb = card.signup_bonus;
    if (!sb) return null;
    let value: string;
    if (sb.type === "cash") value = `$${sb.value.toLocaleString()}`;
    else if (sb.type === "free_nights")
      value = `${sb.value} night${sb.value !== 1 ? "s" : ""}`;
    else {
      const compact =
        sb.value >= 1000
          ? `${(sb.value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`
          : sb.value.toLocaleString();
      const unit = sb.type === "miles" ? "mi" : "pts";
      value = `${compact} ${unit}`;
    }
    const cpp =
      sb.type !== "cash" && sb.type !== "free_nights"
        ? getValuationDetails(card.card_name)?.cpp ?? null
        : null;
    const cashEquiv =
      cpp && typeof sb.value === "number"
        ? Math.round((sb.value * cpp) / 100)
        : null;
    const sub = `After $${sb.spend_requirement.toLocaleString()} in ${sb.timeframe_months} mo${cashEquiv ? ` · ≈ $${cashEquiv.toLocaleString()}` : ""}`;
    return { value, sub };
  }, [card.card_name, card.signup_bonus]);

  const approvalRate =
    card.approved_count !== undefined &&
    card.total_records &&
    card.total_records > 0
      ? Math.round((card.approved_count / card.total_records) * 100)
      : null;

  const creditLength = (() => {
    const v = card.approved_median_length_credit;
    if (v === undefined || v === null) return null;
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (Number.isNaN(n)) return String(v);
    return `${n} yr${n === 1 ? "" : "s"}`;
  })();

  // Combine news + wire into a single tape, newest first.
  type TapeNews = { kind: "news"; date: string; raw: NewsItem };
  type TapeWire = { kind: "wire"; date: string; raw: CardWireEntry };
  const tapeEntries: (TapeNews | TapeWire)[] = useMemo(() => {
    const arr: (TapeNews | TapeWire)[] = [
      ...news.map<TapeNews>((n) => ({ kind: "news", date: n.date, raw: n })),
      ...wire.map<TapeWire>((w) => ({
        kind: "wire",
        date: w.changed_at,
        raw: w,
      })),
    ];
    return arr
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
      .slice(0, 12);
  }, [news, wire]);

  const fieldLabel: Record<string, string> = {
    annual_fee: "Annual fee",
    signup_bonus_value: "Signup bonus",
    reward_top_rate: "Top reward",
    apr_min: "APR min",
    apr_max: "APR max",
  };
  const formatWireValue = (val: string | null, field: string) => {
    if (val === null) return "N/A";
    if (field === "annual_fee") return `$${Number(val).toLocaleString()}`;
    if (field === "signup_bonus_value") return Number(val).toLocaleString();
    if (field.startsWith("apr_")) return `${val}%`;
    if (field === "reward_top_rate") return `${val}x`;
    return val;
  };

  // ---------- Render ----------
  return (
    <div className="landing-v2 card-journal">
      <CreditCardSchema card={card} ratings={ratings} />
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://creditodds.com" },
          {
            name: card.bank,
            url: `https://creditodds.com/bank/${encodeURIComponent(card.bank)}`,
          },
          {
            name: card.card_name,
            url: `https://creditodds.com/card/${card.slug}`,
          },
        ]}
      />

      {/* Terminal bar */}
      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <Link href="/explore" className="cj-crumb">Cards</Link>
          <span className="cj-sep">/</span>
          <Link
            href={`/bank/${encodeURIComponent(card.bank)}`}
            className="cj-crumb"
          >
            {card.bank}
          </Link>
          <span className="cj-sep">/</span>
          <span className="cj-crumb cj-crumb-current" aria-current="page">
            {card.card_name}
          </span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
        <span>
          <span
            className={`cj-status-dot${card.accepting_applications === false ? " cj-status-off" : ""}`}
          />
          {card.accepting_applications === false ? "closed" : "live"}
        </span>
        <div className="cj-term-share" ref={shareMenuRef}>
          <button
            type="button"
            className="cj-term-link"
            onClick={() => setShowShareMenu((p) => !p)}
            aria-expanded={showShareMenu}
          >
            <ShareIcon className="cj-term-icon" />
            share
          </button>
          {showShareMenu && (
            <div className="cj-share-menu">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodedShareTitle}&url=${encodedCardUrl}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Share on X
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodedCardUrl}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Share on Facebook
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedCardUrl}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Share on LinkedIn
              </a>
              <a
                href={`https://www.reddit.com/submit?url=${encodedCardUrl}&title=${encodedShareTitle}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Share on Reddit
              </a>
              <button type="button" onClick={handleCopyShareLink}>
                {copiedShareLink ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
        </div>
        {card.slug && (
          <a
            href={`https://github.com/CreditOdds/creditodds/edit/main/data/cards/${card.slug}.yaml`}
            target="_blank"
            rel="noopener noreferrer"
            className="cj-term-link"
          >
            <PencilSquareIcon className="cj-term-icon" />
            edit
          </a>
        )}
        </div>
      </div>

      {/* Discontinued banner — card has been pulled entirely. */}
      {card.active === false && (
        <div
          style={{
            padding: "10px 24px",
            background: "var(--ink)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <ExclamationTriangleIcon style={{ height: 16, width: 16 }} />
          This card has been discontinued and is no longer offered.
        </div>
      )}

      {/* Closed banner — card exists but isn't taking new applicants. */}
      {card.active !== false && card.accepting_applications === false && (
        <div
          style={{
            padding: "10px 24px",
            background: "var(--warn-2)",
            color: "var(--warn)",
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <ExclamationTriangleIcon style={{ height: 16, width: 16 }} />
          This card is no longer accepting applications.
        </div>
      )}

      <div className="cj-layout">
        {/* Left ToC */}
        <aside className="cj-toc">
          <div className="cj-toc-heading">Contents</div>
          <a href="#overview" className="cj-toc-link">
            <span className="cj-toc-num">01</span>Overview
          </a>
          <a href="#earn" className="cj-toc-link">
            <span className="cj-toc-num">02</span>Earn &amp; credits
          </a>
          <a href="#odds" className="cj-toc-link">
            <span className="cj-toc-num">03</span>Approval odds
          </a>
          {tapeEntries.length > 0 && (
            <a href="#wire" className="cj-toc-link">
              <span className="cj-toc-num">04</span>News &amp; wire
            </a>
          )}
          {articles.length > 0 && (
            <a href="#reading" className="cj-toc-link">
              <span className="cj-toc-num">05</span>Reading
            </a>
          )}
        </aside>

        {/* Main */}
        <main className="cj-main">
          {/* 01 Overview */}
          <section id="overview" className="cj-section">
            <div className="cj-section-num">01 · overview</div>
            <div className="cj-overview-grid">
              <div>
                <h1 className="cj-section-h1">
                  {headlineMain}
                  {headlineMain && " "}
                  <em className="cj-section-accent">{headlineAccent}</em>
                </h1>
                <div className="cj-issuer">
                  <span>
                    by{" "}
                    <Link
                      href={`/bank/${encodeURIComponent(card.bank)}`}
                      className="cj-issuer-link"
                    >
                      {card.bank}
                    </Link>
                  </span>
                  {card.reward_type && (
                    <span
                      className={`cj-reward-chip cj-reward-chip-${card.reward_type}`}
                    >
                      {card.reward_type === "cashback"
                        ? "Cashback"
                        : card.reward_type === "miles"
                          ? "Miles"
                          : "Points"}
                    </span>
                  )}
                </div>
                {card.previous_names && card.previous_names.length > 0 && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--muted)",
                      marginTop: 8,
                      fontStyle: "italic",
                    }}
                  >
                    Previously {card.previous_names.join(", ")}
                  </div>
                )}
                {tagline && <p className="cj-overview-tagline">{tagline}</p>}
              </div>
              <div className="cj-overview-img">
                <CardImage
                  cardImageLink={card.card_image_link}
                  alt={card.card_name}
                  width={260}
                  height={164}
                  priority
                  sizes="(max-width: 768px) 240px, 260px"
                />
              </div>
            </div>

            <div className="cj-readoff">
              <div className="cj-readoff-cell">
                <div className="cj-readoff-k">Annual fee</div>
                <div className="cj-readoff-v">
                  {card.annual_fee !== undefined
                    ? card.annual_fee === 0
                      ? "$0"
                      : `$${card.annual_fee.toLocaleString()}`
                    : "—"}
                </div>
                <div className="cj-readoff-foot">
                  {card.annual_fee === 0 ? "No fee" : "Per year"}
                </div>
              </div>
              <div
                className={`cj-readoff-cell${bonusDisplay ? " cj-readoff-bonus" : ""}`}
              >
                <div className="cj-readoff-k">Sign up bonus</div>
                <div className="cj-readoff-v cj-accent">
                  {bonusDisplay ? bonusDisplay.value : "—"}
                </div>
                <div className="cj-readoff-foot">
                  {bonusDisplay ? bonusDisplay.sub : "No current offer"}
                </div>
              </div>
              <div className="cj-readoff-cell">
                <div className="cj-readoff-k">Credits</div>
                <div className="cj-readoff-v">
                  {headlineCredits ?? "—"}
                </div>
                <div className="cj-readoff-foot">
                  {creditBenefits.length > 0
                    ? `${creditBenefits.length} credit${creditBenefits.length !== 1 ? "s" : ""}`
                    : "No tracked credits"}
                </div>
              </div>
              <div className="cj-readoff-cell">
                <div className="cj-readoff-k">Median FICO</div>
                <div className="cj-readoff-v">
                  {card.approved_median_credit_score ?? "—"}
                </div>
                <div className="cj-readoff-foot">Approved</div>
              </div>
              <div className="cj-readoff-cell">
                <div className="cj-readoff-k">Median income</div>
                <div className="cj-readoff-v">
                  {card.approved_median_income
                    ? `$${card.approved_median_income.toLocaleString()}`
                    : "—"}
                </div>
                <div className="cj-readoff-foot">Approved</div>
              </div>
            </div>
          </section>

          {/* 02 Earn & credits */}
          <section id="earn" className="cj-section">
            <div className="cj-section-num">02 · earn &amp; credits</div>
            <h2 className="cj-section-h2">
              Earn rates <em className="cj-section-accent">&amp; credits</em>
            </h2>

            <div className="cj-two-up">
              <div>
                <div className="cj-table-label">Earn rates</div>
                {sortedRewards.length > 0 ? (
                  <table className="cj-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th className="cj-tr">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRewards.map((r) => {
                        let lbl: string;
                        if (r.category === "top_category") {
                          lbl = r.choices && r.choices > 1
                            ? `Top ${r.choices} spend categories`
                            : "Top spend category";
                        } else if (r.category === "selected_categories") {
                          lbl = r.choices === 1
                            ? "Choose 1 category"
                            : `Choose ${r.choices ?? ""} categories`;
                        } else if (r.category === "rotating") {
                          // Legacy fallback for cards still served with the old
                          // overloaded `rotating` category before CDN repropagates.
                          if (r.mode === "user_choice") {
                            lbl = r.choices === 1
                              ? "Choose 1 category"
                              : `Choose ${r.choices ?? ""} categories`;
                          } else if (r.mode === "auto_top_spend") {
                            lbl = r.choices && r.choices > 1
                              ? `Top ${r.choices} spend categories`
                              : "Top spend category";
                          } else {
                            lbl = "Rotating categories";
                          }
                        } else {
                          lbl = categoryLabels[r.category] || r.category;
                        }
                        return (
                          <tr key={`${r.category}-${r.value}-${r.unit}`}>
                            <td>
                              <div className="cj-cell-primary cj-reward-cat">
                                <CategoryIcon
                                  category={r.category}
                                  className={`cj-reward-icon${r.category === "everything_else" ? " cj-reward-icon-muted" : ""}`}
                                />
                                <span>{lbl}</span>
                              </div>
                              {r.note && (
                                <div className="cj-cell-detail">{r.note}</div>
                              )}
                              {r.current_categories && r.current_period && (
                                <div className="cj-cell-detail">
                                  {r.current_period}:{" "}
                                  {r.current_categories
                                    .map((c) => categoryLabels[c] || c)
                                    .join(", ")}
                                </div>
                              )}
                              {r.eligible_categories &&
                                (r.mode === "user_choice" ||
                                  r.mode === "auto_top_spend") && (
                                  <div className="cj-cell-detail">
                                    Eligible:{" "}
                                    {r.eligible_categories
                                      .map((c) => categoryLabels[c] || c)
                                      .join(", ")}
                                  </div>
                                )}
                            </td>
                            <td className="cj-tr">
                              <span className="cj-rate-mono cj-eff-pct">
                                {formatRewardValue(r)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="cj-cell-detail">No rewards listed.</div>
                )}
                {card.reward_type &&
                  card.reward_type !== "cashback" &&
                  (() => {
                    const v = getValuationDetails(card.card_name);
                    if (!v?.toolSlug) return null;
                    const unit = card.reward_type === "miles" ? "mile" : "point";
                    return (
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 12,
                          color: "var(--muted)",
                        }}
                      >
                        Estimated value:{" "}
                        <Link
                          href={`/tools/${v.toolSlug}-to-usd`}
                          style={{ color: "var(--accent)" }}
                        >
                          {v.cpp.toFixed(1)}¢/{unit}
                        </Link>
                      </div>
                    );
                  })()}
              </div>

              <div>
                <div className="cj-table-label">Statement credits</div>
                {creditBenefits.length > 0 ? (
                  <table className="cj-table">
                    <thead>
                      <tr>
                        <th>Credit</th>
                        <th className="cj-tr">Annual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {creditBenefits.map((b, i) => (
                        <tr key={`${b.name}-${i}`}>
                          <td>
                            <div className="cj-cell-primary">{b.name}</div>
                            <div className="cj-cell-detail">{b.description}</div>
                          </td>
                          <td className="cj-tr">
                            {formatBenefitValue(b)}
                          </td>
                        </tr>
                      ))}
                      {headlineCredits && (
                        <tr className="cj-row-total">
                          <td>
                            <span className="cj-row-total-label">
                              Total annual value
                            </span>
                          </td>
                          <td className="cj-tr">
                            <span className="cj-row-total-v">
                              {headlineCredits}
                            </span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <div className="cj-cell-detail">
                    No statement credits tracked.
                  </div>
                )}
              </div>
            </div>

            {card.apr &&
              (card.apr.purchase_intro || card.apr.balance_transfer_intro) && (
                <div className="cj-intro-apr">
                  <div className="cj-intro-apr-label">Intro APR</div>
                  <div className="cj-intro-apr-rows">
                    {card.apr.balance_transfer_intro && (
                      <div>
                        <b>{card.apr.balance_transfer_intro.rate}%</b> for{" "}
                        {card.apr.balance_transfer_intro.months} months on
                        balance transfers
                      </div>
                    )}
                    {card.apr.purchase_intro && (
                      <div>
                        <b>{card.apr.purchase_intro.rate}%</b> for{" "}
                        {card.apr.purchase_intro.months} months on purchases
                      </div>
                    )}
                    {card.apr.regular && (
                      <div className="cj-intro-apr-then">
                        Then {card.apr.regular.min}%–{card.apr.regular.max}%
                        variable APR
                      </div>
                    )}
                  </div>
                </div>
              )}
          </section>

          {/* 03 Approval odds */}
          <section id="odds" className="cj-section">
            <div className="cj-section-num">03 · approval odds</div>
            <div className="cj-odds-header">
              <h2 className="cj-section-h2">
                Approval <em className="cj-section-accent">odds</em>
              </h2>
              {(card.total_records || 0) > 0 && (
                <div className="cj-odds-meta">
                  n = {card.total_records!.toLocaleString()}
                  {(card.approved_count || 0) > 0 && (
                    <>
                      {" · "}
                      {card.approved_count!.toLocaleString()} approved
                    </>
                  )}
                  {(card.rejected_count || 0) > 0 && (
                    <>
                      {" · "}
                      {card.rejected_count!.toLocaleString()} denied
                    </>
                  )}
                </div>
              )}
            </div>

            {(card.approved_count || 0) > 0 ? (
              <>
                <div className="cj-stat-strip">
                  <div className="cj-stat">
                    <div className="cj-stat-k">Median FICO</div>
                    <div className="cj-stat-v">
                      {card.approved_median_credit_score ?? "—"}
                    </div>
                  </div>
                  <div className="cj-stat">
                    <div className="cj-stat-k">Median income</div>
                    <div className="cj-stat-v">
                      {card.approved_median_income
                        ? `$${card.approved_median_income.toLocaleString()}`
                        : "—"}
                    </div>
                  </div>
                  <div className="cj-stat">
                    <div className="cj-stat-k">Credit history</div>
                    <div className="cj-stat-v">{creditLength ?? "—"}</div>
                  </div>
                </div>

                <div style={{ marginTop: 24 }}>
                  <div className="cj-table-label">
                    Approval rate by FICO score
                  </div>
                  <div className="cj-bars">
                    {FICO_BUCKETS.map((b, i) => {
                      const a = acceptedBuckets[i];
                      const r = rejectedBuckets[i];
                      const total = a + r;
                      const aPct =
                        total > 0 ? (a / maxBucketTotal) * 100 : 0;
                      const rPct =
                        total > 0 ? (r / maxBucketTotal) * 100 : 0;
                      const rate =
                        total > 0 ? Math.round((a / total) * 100) : null;
                      return (
                        <div key={b.label} className="cj-bar-row">
                          <span className="cj-bar-label">{b.label}</span>
                          {total > 0 ? (
                            <span className="cj-bar-track">
                              <span
                                className="cj-bar-app"
                                style={{ width: `${aPct}%` }}
                              />
                              <span
                                className="cj-bar-den"
                                style={{ width: `${rPct}%` }}
                              />
                            </span>
                          ) : (
                            <span className="cj-bar-track">
                              <span
                                className="cj-bar-empty"
                                style={{ padding: "0 6px", fontSize: 10 }}
                              >
                                no data
                              </span>
                            </span>
                          )}
                          <span className="cj-bar-n">
                            {rate !== null ? `${rate}%` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="cj-bar-legend">
                    <span>
                      <span
                        className="cj-bar-legend-swatch"
                        style={{ background: "var(--accent)" }}
                      />
                      Approved
                    </span>
                    <span>
                      <span
                        className="cj-bar-legend-swatch"
                        style={{ background: "var(--warn)", opacity: 0.4 }}
                      />
                      Denied
                    </span>
                  </div>
                </div>

                {(() => {
                  const tabs: {
                    id: "score" | "history" | "limit";
                    label: string;
                    chart: React.ReactNode;
                  }[] = [];
                  if (hasChartOne) {
                    tabs.push({
                      id: "score",
                      label: "Score / Income",
                      chart: (
                        <ScatterPlot
                          title="Credit Score vs Income"
                          xAxis="Credit Score"
                          yAxis="Income (USD)"
                          yPrefix="$"
                          series={[
                            { name: "Accepted", color: "#6d3fe8", data: chartOne[0] || [] },
                            { name: "Rejected", color: "#d23a62", data: chartOne[1] || [] },
                          ]}
                        />
                      ),
                    });
                  }
                  if (hasChartTwo) {
                    tabs.push({
                      id: "history",
                      label: "History / Score",
                      chart: (
                        <ScatterPlot
                          title="Length of Credit vs Credit Score"
                          xAxis="Length of Credit (Year)"
                          yAxis="Credit Score"
                          xSuffix=" yr"
                          series={[
                            { name: "Accepted", color: "#6d3fe8", data: chartTwo[0] || [] },
                            { name: "Rejected", color: "#d23a62", data: chartTwo[1] || [] },
                          ]}
                        />
                      ),
                    });
                  }
                  if (hasChartThree) {
                    tabs.push({
                      id: "limit",
                      label: "Income / Limit",
                      chart: (
                        <ScatterPlot
                          title="Income vs Starting Credit Limit"
                          xAxis="Income (USD)"
                          yAxis="Starting Credit Limit (USD)"
                          xPrefix="$"
                          yPrefix="$"
                          series={[
                            { name: "Accepted", color: "#6d3fe8", data: chartThree[0] || [] },
                          ]}
                        />
                      ),
                    });
                  }
                  if (tabs.length === 0) return null;
                  const current =
                    tabs.find((t) => t.id === activeChart) ?? tabs[0];
                  return (
                    <div className="cj-chart-stage" style={{ marginTop: 24 }}>
                      {tabs.length > 1 && (
                        <div className="cj-graph-tabs" role="tablist">
                          {tabs.map((t) => (
                            <button
                              key={t.id}
                              role="tab"
                              type="button"
                              aria-selected={current.id === t.id}
                              className={`cj-graph-tab${current.id === t.id ? " active" : ""}`}
                              onClick={() => setActiveChart(t.id)}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="cj-chart-body">
                        <ErrorBoundary fallback={<ChartErrorFallback />}>
                          {current.chart}
                        </ErrorBoundary>
                      </div>
                    </div>
                  );
                })()}

                {card.accepting_applications && (
                  <div className="cj-verdict" style={{ marginTop: 20 }}>
                    Have you applied for this card?{" "}
                    {authState.isAuthenticated ? (
                      <button
                        type="button"
                        onClick={() => setShowModal(true)}
                        style={{
                          background: "transparent",
                          border: 0,
                          color: "var(--accent)",
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Submit a data point →
                      </button>
                    ) : (
                      <Link
                        href={`/login?redirect=${encodeURIComponent(`/card/${card.slug}?submit=true`)}`}
                        style={{ color: "var(--accent)", fontWeight: 600 }}
                      >
                        Log in to submit a data point →
                      </Link>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="cj-verdict">
                We&apos;re still collecting data on this card. Submit a data
                point to help.{" "}
                {authState.isAuthenticated ? (
                  <button
                    type="button"
                    onClick={() => setShowModal(true)}
                    style={{
                      background: "transparent",
                      border: 0,
                      color: "var(--accent)",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Submit →
                  </button>
                ) : (
                  <Link
                    href={`/login?redirect=${encodeURIComponent(`/card/${card.slug}?submit=true`)}`}
                    style={{ color: "var(--accent)", fontWeight: 600 }}
                  >
                    Log in to submit →
                  </Link>
                )}
              </div>
            )}
          </section>

          {/* 04 News & wire */}
          {tapeEntries.length > 0 && (
            <section id="wire" className="cj-section">
              <div className="cj-section-num">04 · news &amp; wire</div>
              <h2 className="cj-section-h2">
                News &amp; <em className="cj-section-accent">wire</em>
              </h2>
              <div className="cj-tape">
                <div className="cj-tape-head">
                  <div>When</div>
                  <div>Event</div>
                  <div className="cj-tape-res">Source</div>
                </div>
                {tapeEntries.map((t, i) => {
                  const dateText = new Date(t.date).toLocaleDateString(
                    "en-US",
                    { year: "numeric", month: "short", day: "numeric" },
                  );
                  if (t.kind === "news") {
                    const n = t.raw;
                    const tag = n.tags[0] as NewsTag | undefined;
                    return (
                      <Link
                        key={`n-${n.id}-${i}`}
                        href={`/news/${n.id}`}
                        className="cj-tape-row"
                      >
                        <div className="cj-tape-when">{dateText}</div>
                        <div className="cj-tape-event">
                          <span className="cj-tape-field">{n.title}</span>
                        </div>
                        <div className="cj-tape-res">
                          <span className="cj-news-tag">
                            {tag ? tagLabels[tag] : "NEWS"}
                          </span>
                        </div>
                      </Link>
                    );
                  }
                  const w = t.raw;
                  const isUp =
                    w.old_value !== null &&
                    w.new_value !== null &&
                    Number(w.new_value) > Number(w.old_value);
                  const isDn =
                    w.old_value !== null &&
                    w.new_value !== null &&
                    Number(w.new_value) < Number(w.old_value);
                  return (
                    <div key={`w-${w.id}`} className="cj-tape-row">
                      <div className="cj-tape-when">{dateText}</div>
                      <div className="cj-tape-event">
                        <span className="cj-tape-field">
                          {fieldLabel[w.field] || w.field}
                        </span>
                        <span className="cj-tape-change">
                          <span className="cj-tape-old">
                            {formatWireValue(w.old_value, w.field)}
                          </span>
                          {" → "}
                          <span
                            className={`cj-tape-new${isUp ? " cj-pos" : isDn ? " cj-neg" : ""}`}
                          >
                            {formatWireValue(w.new_value, w.field)}
                          </span>
                        </span>
                      </div>
                      <div className="cj-tape-res">
                        <span className="cj-pill">WIRE</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 05 Reading */}
          {articles.length > 0 && (
            <section id="reading" className="cj-section">
              <div className="cj-section-num">05 · reading</div>
              <h2 className="cj-section-h2">
                Further <em className="cj-section-accent">reading</em>
              </h2>
              <div className="cj-tape">
                <div className="cj-tape-head">
                  <div>By</div>
                  <div>Title</div>
                  <div className="cj-tape-res">Read</div>
                </div>
                {articles.slice(0, 8).map((a) => (
                  <Link
                    key={a.id}
                    href={`/articles/${a.slug}`}
                    className="cj-tape-row"
                  >
                    <div className="cj-tape-when">{a.author}</div>
                    <div className="cj-tape-event">
                      <span className="cj-tape-field">{a.title}</span>
                    </div>
                    <div className="cj-tape-res">{a.reading_time} min</div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </main>

        {/* Right rail */}
        <aside className="cj-rail">
          <div className="cj-apply">
            <div className="cj-apply-k">Welcome bonus</div>
            <div className="cj-apply-v">
              {bonusDisplay?.value ?? "No current offer"}
            </div>
            {bonusDisplay && (
              <div className="cj-apply-sub">{bonusDisplay.sub}</div>
            )}
            {card.signup_bonus?.note && (
              <div className="cj-apply-note">{card.signup_bonus.note}</div>
            )}
            {card.accepting_applications ? (
              <>
                {card.apply_link && (
                  <a
                    href={withApplySource(card.apply_link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleCardApplyClick("direct")}
                    className="cj-apply-btn"
                  >
                    Apply now
                  </a>
                )}
                {randomReferralUrl && (
                  <a
                    href={randomReferralUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleReferralClick}
                    className="cj-apply-btn-outline"
                  >
                    Apply with referral
                  </a>
                )}
                {!card.apply_link && !randomReferralUrl && (
                  <div className="cj-apply-closed">
                    Apply link not available yet
                  </div>
                )}
              </>
            ) : (
              <div className="cj-apply-closed">
                Not accepting applications
              </div>
            )}
          </div>

          {ratings.average !== null && ratings.count > 0 && (
            <div className="cj-rating">
              <div>
                <div className="cj-rating-v">
                  {ratings.average.toFixed(1)}{" "}
                  <small>/ 5</small>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    marginTop: 2,
                  }}
                >
                  {ratings.count}{" "}
                  {ratings.count === 1 ? "rating" : "ratings"}
                </div>
              </div>
              <div className="cj-rating-stars">
                {[1, 2, 3, 4, 5].map((s) => (
                  <StarIcon
                    key={s}
                    fill={(ratings.average ?? 0) - (s - 1)}
                  />
                ))}
              </div>
            </div>
          )}

          <Link
            href={`/compare?cards=${card.slug}`}
            className="cj-rail-cta"
          >
            <ScaleIcon className="cj-rail-cta-icon" />
            Compare cards
          </Link>

          {similarCards.length > 0 && (
            <div className="cj-rail-block">
              <div className="cj-rail-label">Alternatives</div>
              {similarCards.slice(0, 4).map((c) => {
                const fee =
                  c.annual_fee !== undefined
                    ? c.annual_fee === 0
                      ? "$0"
                      : `$${c.annual_fee}`
                    : "—";
                return (
                  <Link
                    key={c.slug}
                    href={`/card/${c.slug}`}
                    className="cj-sim-row"
                  >
                    <div className="cj-sim-img">
                      <CardImage
                        cardImageLink={c.card_image_link}
                        alt={c.card_name}
                        width={48}
                        height={30}
                        sizes="48px"
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        className="cj-sim-name"
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.card_name}
                      </div>
                      <div className="cj-sim-meta">{c.bank}</div>
                    </div>
                    <span className="cj-sim-rate">{fee}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      <SubmitRecordModal
        show={showModal}
        handleClose={() => setShowModal(false)}
        card={card}
        onSuccess={handleSubmitSuccess}
      />
      <V2Footer />
    </div>
  );
}
