import { Metadata } from "next";
import { getBestPages } from "@/lib/best";
import { getAllCards } from "@/lib/api";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import BestV2Client from "./BestV2Client";

export const metadata: Metadata = {
  title: "Best Credit Cards of 2026 - Top Picks & Comparisons",
  description: "Curated rankings of the best credit cards of 2026 across categories. Data-driven picks updated with live approval odds and bonus values.",
  openGraph: {
    title: "Best Credit Cards of 2026 | CreditOdds",
    description: "Curated rankings of the best credit cards of 2026 across categories.",
    url: "https://creditodds.com/best",
    type: "website",
  },
  alternates: {
    canonical: "https://creditodds.com/best",
  },
};

export const revalidate = 300;

export default async function BestIndexPage() {
  const [pages, cards] = await Promise.all([getBestPages(), getAllCards()]);

  const totalRecords = cards.reduce(
    (acc, c) => acc + (c.approved_count ?? 0) + (c.rejected_count ?? 0),
    0
  );

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Best Credit Cards",
    description: "Curated rankings of the best credit cards across categories.",
    url: "https://creditodds.com/best",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: pages.slice(0, 10).map((page, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `https://creditodds.com/best/${page.slug}`,
      })),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: 'Best Cards', url: 'https://creditodds.com/best' },
        ]}
      />
      <BestV2Client pages={pages} totalRecords={totalRecords} totalCards={cards.length} />
    </>
  );
}
