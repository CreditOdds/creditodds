import { readFileSync } from "fs";
import { join } from "path";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardBenefit, getCard, getCardGraphs, getAllCards, getCardRatings, getCardWire, getComparePartners, GraphData, CardWireEntry } from "@/lib/api";
import { getNews, NewsItem } from "@/lib/news";
import { getArticles, Article } from "@/lib/articles";
import CardClient from "./CardClient";

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

interface CardPageProps {
  params: Promise<{ name: string }>;
}

// Generate static pages for all cards at build time
export async function generateStaticParams() {
  try {
    const cards = await getAllCards();
    return cards.map((card) => ({
      name: card.slug,
    }));
  } catch {
    return [];
  }
}

// Dynamic metadata for SEO
export async function generateMetadata({ params }: CardPageProps): Promise<Metadata> {
  try {
    const { name: slug } = await params;
    const card = await getCard(slug);

    const seoName = /card/i.test(card.card_name) ? card.card_name : `${card.card_name} Credit Card`;
    const bankSuffix =
      card.bank && !card.card_name.toLowerCase().includes(card.bank.toLowerCase())
        ? ` from ${card.bank}`
        : '';
    const description = card.approved_median_credit_score
      ? `Approval odds for the ${seoName}${bankSuffix}. Median approved credit score ${card.approved_median_credit_score}${card.approved_median_income ? `, income $${card.approved_median_income.toLocaleString()}` : ''}. See real cardholder data points before you apply.`
      : `Approval odds, credit score data points, income, and real cardholder applications for the ${seoName}${bankSuffix}. Check your approval chances before you apply.`;

    return {
      title: seoName,
      description,
      openGraph: {
        title: `${seoName} | CreditOdds`,
        description: `See approval odds for ${seoName}${card.approved_median_credit_score ? `. Median approved credit score: ${card.approved_median_credit_score}` : ''}`,
        siteName: 'CreditOdds',
        type: 'website',
        url: `https://creditodds.com/card/${card.slug}`,
      },
      twitter: {
        card: 'summary_large_image',
        title: `${seoName} | CreditOdds`,
        description: `See approval odds for ${seoName}`,
      },
      alternates: {
        canonical: `https://creditodds.com/card/${card.slug}`,
      },
    };
  } catch {
    return { title: 'Card Not Found' };
  }
}

export default async function CardPage({ params }: CardPageProps) {
  const { name: slug } = await params;

  try {
    // Fetch all data in parallel — chain getCard → getCardRatings together
    // so ratings fetches concurrently with graphs/news/articles instead of after them all
    const [cardWithRatingsAndWire, graphData, allNews, allArticles, allCards, comparePartners] = await Promise.all([
      getCard(slug).then(async (card) => ({
        card,
        ratings: await getCardRatings(card.card_name).catch(() => ({ count: 0, average: null })),
        wire: await getCardWire(Number(card.card_id)).catch(() => [] as CardWireEntry[]),
      })),
      getCardGraphs(slug).catch(() => [] as GraphData[]),
      getNews().catch(() => [] as NewsItem[]),
      getArticles().catch(() => [] as Article[]),
      getAllCards().catch(() => [] as Card[]),
      getComparePartners(slug, 20).catch(() => []),
    ]);

    const { card, ratings, wire } = cardWithRatingsAndWire;

    // Merge benefits from local cards.json: use as fallback when API has none,
    // and overlay value_unit on API benefits while CloudFront catches up to the
    // schema (so points-valued benefits render correctly even before CDN refresh).
    try {
      const localData = JSON.parse(readFileSync(join(process.cwd(), '../../data/cards.json'), 'utf8'));
      const localCard = localData.cards.find((c: { slug: string; benefits?: CardBenefit[] }) => c.slug === slug);
      if (localCard?.benefits) {
        if (!card.benefits) {
          card.benefits = localCard.benefits;
        } else {
          const localByName = new Map(localCard.benefits.map((b: CardBenefit) => [b.name, b]));
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

    return <CardClient card={card} graphData={graphData} news={cardNews} articles={cardArticles} ratings={ratings} similarCards={similarCards} wire={wire} frequentlyComparedCards={frequentlyComparedCards} />;
  } catch {
    notFound();
  }
}
