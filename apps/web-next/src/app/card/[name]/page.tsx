import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCard, getCardGraphs, getAllCards, GraphData } from "@/lib/api";
import { getNews, NewsItem } from "@/lib/news";
import CardClient from "./CardClient";

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
    // Fetch card, graph data, and news in parallel for faster loading
    const [card, graphData, allNews] = await Promise.all([
      getCard(slug),
      getCardGraphs(slug).catch(() => [] as GraphData[]), // Empty array for new cards with no data
      getNews().catch(() => [] as NewsItem[]),
    ]);

    // Filter news for this specific card
    const cardNews = allNews.filter(news => news.card_slugs?.includes(slug));

    return <CardClient card={card} graphData={graphData} news={cardNews} />;
  } catch {
    notFound();
  }
}
