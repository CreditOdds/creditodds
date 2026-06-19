import { Metadata } from "next";
import { getAllCards, getCardViewCounts, type Card } from "@/lib/api";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import ExploreV2Client from "./ExploreV2Client";

// Revalidate every 5 minutes
export const revalidate = 300;

// Trim each card to only the fields ExploreV2Client actually reads before it
// goes into the RSC/HTML payload. Drops benefits, apr, referrals, our_take,
// medians, etc., and reduces rewards to {category,value,unit} — roughly a
// two-thirds cut per card on a page that ships the full catalog.
function slimForExplore(c: Card): Card {
  return {
    card_id: c.card_id,
    db_card_id: c.db_card_id,
    card_name: c.card_name,
    slug: c.slug,
    bank: c.bank,
    card_image_link: c.card_image_link,
    accepting_applications: c.accepting_applications,
    approved_count: c.approved_count,
    rejected_count: c.rejected_count,
    annual_fee: c.annual_fee,
    reward_type: c.reward_type,
    category: c.category,
    tags: c.tags,
    signup_bonus: c.signup_bonus
      ? {
          value: c.signup_bonus.value,
          type: c.signup_bonus.type,
          spend_requirement: c.signup_bonus.spend_requirement,
          timeframe_months: c.signup_bonus.timeframe_months,
        }
      : undefined,
    rewards: c.rewards?.map((r) => ({
      category: r.category,
      value: r.value,
      unit: r.unit,
    })),
  };
}

export const metadata: Metadata = {
  title: "Explore Credit Cards",
  description: "Browse every credit card with approval odds, average approved scores, and income data. Sortable by issuer, fee, and rewards type.",
  openGraph: {
    title: "Explore Credit Cards | CreditOdds",
    description: "Browse every credit card with approval odds, average approved scores, and income data.",
    url: "https://creditodds.com/explore",
    type: "website",
  },
  alternates: {
    canonical: "https://creditodds.com/explore",
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
      <ExploreV2Client cards={sortedCards.map(slimForExplore)} trendingViews={trendingViews} />
    </>
  );
}
