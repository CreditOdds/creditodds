import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCard, getCardGraphs, getAllCards, GraphData } from "@/lib/api";
import CardClient from "./CardClient";

// Force dynamic rendering to ensure fresh graph data on each request
export const dynamic = 'force-dynamic';

interface CardPageProps {
  params: Promise<{ name: string }>;
}

// Generate static pages for all cards at build time
export async function generateStaticParams() {
  try {
    const cards = await getAllCards();
    return cards.map((card) => ({
      name: card.card_name,
    }));
  } catch {
    return [];
  }
}

// Dynamic metadata for SEO
export async function generateMetadata({ params }: CardPageProps): Promise<Metadata> {
  try {
    const { name } = await params;
    const cardName = decodeURIComponent(name);
    const card = await getCard(cardName);

    return {
      title: card.card_name,
      description: `Credit card approval odds for ${card.card_name}. Median approved credit score: ${card.approved_median_credit_score}, income: $${card.approved_median_income?.toLocaleString()}`,
      openGraph: {
        title: `${card.card_name} | CreditOdds`,
        description: `See approval odds for ${card.card_name}. Average approved credit score: ${card.approved_median_credit_score}`,
        images: card.card_image_link
          ? [`${process.env.NEXT_PUBLIC_CDN_URL}/card_images/${card.card_image_link}`]
          : [],
      },
    };
  } catch {
    return { title: 'Card Not Found' };
  }
}

export default async function CardPage({ params }: CardPageProps) {
  const { name } = await params;
  const cardName = decodeURIComponent(name);

  try {
    const card = await getCard(cardName);

    // Try to get graph data, but use empty array if it fails (for new cards with no data)
    let graphData: GraphData[] = [];
    try {
      graphData = await getCardGraphs(cardName);
    } catch {
      // Keep empty array for new cards with no data
    }

    return <CardClient card={card} graphData={graphData} />;
  } catch {
    notFound();
  }
}
