import { getLocalCardBenefits } from "@/lib/localCardBenefits";
import { optionalRead } from "@/lib/optionalRead";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardNotFoundError } from "@/lib/cardNotFound";
import { Card, CardBenefit, getCard, getCardGraphs, getCardRecords, getAllCards, getCardRatings, getCardWire, getCardProductChanges, getComparePartners, EMPTY_PRODUCT_CHANGES, GraphData, CardRecord, CardWireEntry, ProductChangeEdge } from "@/lib/api";
import { getNews, NewsItem } from "@/lib/news";
import { getArticles, Article } from "@/lib/articles";
import { getBestPages } from "@/lib/best";
import { categoryLabels, pickHeadlineReward } from "@/lib/cardDisplayUtils";
import { truncateTitle } from "@/lib/seo";
import CardClient from "./CardClient";

function buildMetaDescription(card: Card): string {
  const seoName = /card/i.test(card.card_name) ? card.card_name : `${card.card_name} Credit Card`;
  const bankSuffix =
    card.bank && !card.card_name.toLowerCase().includes(card.bank.toLowerCase())
      ? ` from ${card.bank}`
      : '';
  const cardKind = card.reward_type ?? null;
  const cardLabel = cardKind ? `${cardKind} card` : 'credit card';

  const facts: string[] = [];

  if (card.annual_fee === 0) facts.push('no annual fee');
  else if (typeof card.annual_fee === 'number') facts.push(`a $${card.annual_fee} annual fee`);

  const headline = pickHeadlineReward(card.rewards);
  if (headline) {
    const r = headline.reward;
    let rate: string;
    if (r.unit === 'percent') rate = `${r.value}% back`;
    else if (r.unit === 'points_per_dollar') rate = `${r.value}x ${cardKind === 'miles' ? 'miles' : 'points'}`;
    else rate = `${r.value} ${r.unit}`;
    const catLabel = r.category === 'everything_else'
      ? 'everything'
      : (categoryLabels[r.category] || r.category.replace(/_/g, ' ')).toLowerCase();
    facts.push(`${rate} on ${catLabel}`);
  }

  if (card.signup_bonus) {
    const sb = card.signup_bonus;
    const valStr = sb.type === 'cash'
      ? `$${sb.value.toLocaleString()}`
      : `${sb.value.toLocaleString()} ${sb.type.replace(/_/g, ' ')}`;
    const reqStr = sb.spend_requirement && sb.timeframe_months
      ? ` after $${sb.spend_requirement.toLocaleString()} in ${sb.timeframe_months}mo`
      : '';
    facts.push(`a ${valStr} signup bonus${reqStr}`);
  }

  let lead = `The ${seoName}${bankSuffix} is a ${cardLabel}`;
  if (facts.length === 1) lead += ` with ${facts[0]}.`;
  else if (facts.length > 1) lead += ` with ${facts.slice(0, -1).join(', ')}, and ${facts[facts.length - 1]}.`;
  else lead += '.';

  return `${lead} See full details, rewards, fees, and cardholder data on CreditOdds.`;
}

// Bucket annual fees so we don't suggest a $0 secured card next to a $695
// luxury card just because they share a "travel" tag. Same band = full credit,
// one band apart = half credit, otherwise no boost.
function feeBand(fee?: number | null): number {
  if (fee === undefined || fee === null) return 0;
  if (fee === 0) return 0;
  if (fee < 100) return 1;
  if (fee < 250) return 2;
  if (fee < 450) return 3;
  return 4;
}

function getSimilarCards(
  card: Card,
  allCards: Card[],
  partnerCounts: Map<string, number>,
  limit = 6,
): Card[] {
  const candidates = allCards.filter(c => c.slug !== card.slug && c.active !== false);
  const sourceBand = feeBand(card.annual_fee);

  const scored = candidates.map(c => {
    let score = 0;
    if (card.reward_type && c.reward_type === card.reward_type) score += 3;
    if (c.bank === card.bank) score += 2;
    if (card.tags && c.tags) {
      score += card.tags.filter(t => c.tags!.includes(t)).length;
    }
    if (card.category && c.category === card.category) score += 1;

    const bandDist = Math.abs(sourceBand - feeBand(c.annual_fee));
    if (bandDist === 0) score += 2;
    else if (bandDist === 1) score += 1;

    // Behavioral signal: the count of times this candidate has been compared
    // against the source card. Capped at 10 so one viral pair can't crowd
    // out everything else; 1.5pts per compare ≈ one tag-overlap of nudge.
    // Stays inert until card_compare_pair_counts has data for the slug.
    const compares = partnerCounts.get(c.slug) ?? 0;
    score += Math.min(compares, 10) * 1.5;

    return { card: c, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.card);
}

// Revalidate every 5 minutes for fresh data while enabling caching
export const revalidate = 300;
export const dynamic = 'force-static';
export const dynamicParams = true;

interface CardPageProps {
  params: Promise<{ name: string }>;
}

// Keep Amplify's 220 MiB artifact bounded as the catalog grows. Prebuild
// 80 active/high-data cards; other slugs render on first request and use the
// same ISR cache. All cards remain in the sitemap and catalog.
export async function generateStaticParams() {
  const cards = await getAllCards();
  return [...cards]
    .sort((a, b) => Number(a.active === false) - Number(b.active === false)
      || (b.total_records ?? 0) - (a.total_records ?? 0)
      || a.slug.localeCompare(b.slug))
    .slice(0, 80)
    .map(card => ({ name: card.slug }));
}

async function getCardOrNotFound(slug: string): Promise<Card> {
  try {
    return await getCard(slug);
  } catch (error) {
    if (error instanceof CardNotFoundError) notFound();
    throw error;
  }
}

// Dynamic metadata for SEO
export async function generateMetadata({ params }: CardPageProps): Promise<Metadata> {
  const { name: slug } = await params;
  const card = await getCardOrNotFound(slug);

  const seoName = /card/i.test(card.card_name) ? card.card_name : `${card.card_name} Credit Card`;
  const description = buildMetaDescription(card);

  return {
    title: truncateTitle(seoName),
    description,
    openGraph: {
      title: `${seoName} | CreditOdds`,
      description,
      siteName: 'CreditOdds',
      type: 'website',
      url: `https://creditodds.com/card/${card.slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${seoName} | CreditOdds`,
      description,
    },
    alternates: {
      canonical: `https://creditodds.com/card/${card.slug}`,
    },
  };
}

export default async function CardPage({ params }: CardPageProps) {
  const { name: slug } = await params;

  // Fetch all data in parallel — chain getCard → getCardRatings together
  // so ratings fetches concurrently with graphs/news/articles instead of after them all
  const [cardWithRatingsAndWire, graphData, records, allNews, allArticles, allCards, comparePartners, bestPages, localBenefits] = await Promise.all([
    getCardOrNotFound(slug).then(async (card) => {
      // card_id is the numeric DB id once a card has been synced to the
      // database, but falls back to the slug for a brand-new card that hasn't
      // synced yet. Skip card-wire in that case — there are no wire entries
      // for an unsynced card, and asking for card_id=NaN 500s the API.
      const wireId = Number(card.card_id);
      const [ratings, wire, productChanges] = await Promise.all([
        optionalRead(signal => getCardRatings(card.card_name, card.db_card_id ?? card.card_id, signal), { count: 0, average: null }),
        Number.isInteger(wireId)
          ? optionalRead(signal => getCardWire(wireId, signal), [] as CardWireEntry[])
          : Promise.resolve([] as CardWireEntry[]),
        Number.isInteger(wireId)
          ? optionalRead(signal => getCardProductChanges(wireId, 6, signal), EMPTY_PRODUCT_CHANGES)
          : Promise.resolve(EMPTY_PRODUCT_CHANGES),
      ]);
      return { card, ratings, wire, productChanges };
    }),
    optionalRead(signal => getCardGraphs(slug, signal), [] as GraphData[]),
    optionalRead(signal => getCardRecords(slug, signal), [] as CardRecord[]),
    optionalRead(signal => getNews(signal), [] as NewsItem[]),
    optionalRead(signal => getArticles(signal), [] as Article[]),
    optionalRead(signal => getAllCards(signal), [] as Card[]),
    optionalRead(signal => getComparePartners(slug, 20, signal), []),
    optionalRead(signal => getBestPages(signal), []),
    optionalRead(() => getLocalCardBenefits(slug), undefined),
  ]);

  const { card, ratings, wire, productChanges } = cardWithRatingsAndWire;

  // Merge benefits from local cards.json: use as fallback when API has none,
  // and overlay value_unit on API benefits while CloudFront catches up to the
  // schema (so points-valued benefits render correctly even before CDN refresh).
  try {
    if (localBenefits) {
      if (!card.benefits) {
        card.benefits = localBenefits;
      } else {
        const localByName = new Map(localBenefits.map((b: CardBenefit) => [b.name, b]));
        card.benefits = card.benefits.map((b) => {
          const local = localByName.get(b.name) as CardBenefit | undefined;
          return local?.value_unit ? { ...b, value_unit: local.value_unit } : b;
        });
      }
    }
  } catch {
    // Silently fail - benefits will appear once CDN is updated
  }

  // Filter news and articles for this specific card
  const cardNews = allNews.filter(news => news.card_slugs?.includes(slug));
  const cardArticles = allArticles.filter(a => a.related_cards?.includes(slug));

  // Behavioral signal for the alternatives ranker — slug → compare count.
  // Sparse until card_compare_pair_counts accumulates data; the scorer
  // gracefully falls back to pure content similarity when empty.
  const partnerCounts = new Map(comparePartners.map(p => [p.slug, p.count]));

  // Find similar cards using content similarity + fee-band proximity +
  // compare-pair behavior layered together.
  const similarCards = getSimilarCards(card, allCards, partnerCounts);

  // Resolve compare-partner slugs into full Card objects (drop any that no
  // longer exist in cards.json). Hard cap at 3 for the rail UI.
  const cardsBySlug = new Map(allCards.map(c => [c.slug, c]));
  const frequentlyComparedCards = comparePartners
    .map(p => cardsBySlug.get(p.slug))
    .filter((c): c is Card => c !== undefined && c.active !== false)
    .slice(0, 3);

  // Product-change edges come back from the DB keyed by card_name (the cards
  // table has no slug column), so resolve each one against cards.json to get a
  // link target and the canonical image. An edge whose card is gone from the
  // catalog still renders, just without a link.
  const cardsByName = new Map(allCards.map(c => [c.card_name.toLowerCase(), c]));
  const toFlowNode = (edge: ProductChangeEdge) => {
    const match = cardsByName.get(edge.card_name.toLowerCase());
    return {
      cardId: edge.card_id,
      cardName: match?.card_name ?? edge.card_name,
      slug: match?.slug,
      cardImageLink: match?.card_image_link ?? edge.card_image_link,
      count: edge.count,
      share: edge.share,
      forced: edge.forced,
    };
  };
  const productChangeFlow = {
    inbound: productChanges.inbound.map(toFlowNode),
    outbound: productChanges.outbound.map(toFlowNode),
    inboundTotal: productChanges.inbound_total,
    outboundTotal: productChanges.outbound_total,
    walletTotal: productChanges.wallet_total,
    redditTotal: productChanges.reddit_total,
  };

  // Top-3 placements across the /best/* pages — surfaced as social-proof
  // badges in the overview block, with deep links back to each list.
  const bestRankings = bestPages
    .map((page) => {
      const idx = page.cards.findIndex((c) => c.slug === slug);
      return idx >= 0 && idx < 3
        ? { rank: idx + 1, title: page.title, slug: page.slug }
        : null;
    })
    .filter((r): r is { rank: number; title: string; slug: string } => r !== null)
    .sort((a, b) => a.rank - b.rank);

  return <CardClient card={card} graphData={graphData} records={records} news={cardNews} articles={cardArticles} ratings={ratings} similarCards={similarCards} wire={wire} frequentlyComparedCards={frequentlyComparedCards} bestRankings={bestRankings} productChanges={productChangeFlow} />;
}
