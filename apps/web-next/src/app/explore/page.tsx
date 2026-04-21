import { Metadata } from "next";
import { getAllCards, getCardViewCounts } from "@/lib/api";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import ExploreV2Client from "./ExploreV2Client";

// Revalidate every 5 minutes
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Explore Credit Cards",
  description: "Browse all credit cards and their approval odds. Compare credit scores, income requirements, and approval rates across different banks.",
  openGraph: {
    title: "Explore Credit Cards | CreditOdds",
    description: "Browse all credit cards and compare approval odds.",
    url: "https://creditodds.com/explore",
    type: "website",
  },
};

export default async function ExplorePage() {
  const [cards, trendingViews] = await Promise.all([
    getAllCards(),
    getCardViewCounts('trending').catch(() => ({}) as Record<number, number>),
  ]);

  const sortedCards = [...cards].sort((a, b) => {
    const aRecords = (a.approved_count || 0) + (a.rejected_count || 0);
    const bRecords = (b.approved_count || 0) + (b.rejected_count || 0);
    if (aRecords !== bRecords) return bRecords - aRecords;
    if (a.bank !== b.bank) return a.bank.localeCompare(b.bank);
    return a.card_name.localeCompare(b.card_name);
  });

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: 'Explore Cards', url: 'https://creditodds.com/explore' },
        ]}
      />
      <ExploreV2Client cards={sortedCards} trendingViews={trendingViews} />
    </>
  );
}
