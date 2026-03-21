import { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, getCard, getCardGraphs, getAllCards, getCardRatings, GraphData } from "@/lib/api";
import { getNews, NewsItem } from "@/lib/news";
import { getArticles, Article } from "@/lib/articles";
import CardClient from "./CardClient";

function getSimilarCards(card: Card, allCards: Card[], limit = 6): Card[] {
  const candidates = allCards.filter(c => c.slug !== card.slug && c.active !== false);

  const scored = candidates.map(c => {
    let score = 0;
    if (card.reward_type && c.reward_type === card.reward_type) score += 3;
    if (c.bank === card.bank) score += 2;
    if (card.tags && c.tags) {
      score += card.tags.filter(t => c.tags!.includes(t)).length;
    }
    if (card.category && c.category === card.category) score += 1;
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
    const description = card.approved_median_credit_score
      ? `Credit card approval odds for ${seoName}. Median approved credit score: ${card.approved_median_credit_score}, income: $${card.approved_median_income?.toLocaleString()}`
      : `See approval odds and data points for the ${seoName} from ${card.bank}.`;

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
    // Fetch card, graph data, news, articles, and all cards in parallel for faster loading
    const [card, graphData, allNews, allArticles, allCards] = await Promise.all([
      getCard(slug),
      getCardGraphs(slug).catch(() => [] as GraphData[]), // Empty array for new cards with no data
      getNews().catch(() => [] as NewsItem[]),
      getArticles().catch(() => [] as Article[]),
      getAllCards().catch(() => [] as Card[]),
    ]);

    // Fetch ratings after we have the card name
    const ratings = await getCardRatings(card.card_name).catch(() => ({ count: 0, average: null }));

    // Filter news and articles for this specific card
    const cardNews = allNews.filter(news => news.card_slugs?.includes(slug));
    const cardArticles = allArticles.filter(a => a.related_cards?.includes(slug));

    // Find similar cards based on reward type, bank, tags, and category
    const similarCards = getSimilarCards(card, allCards);

    return <CardClient card={card} graphData={graphData} news={cardNews} articles={cardArticles} ratings={ratings} similarCards={similarCards} />;
  } catch {
    notFound();
  }
}
