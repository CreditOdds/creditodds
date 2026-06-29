import { Metadata } from "next";
import { getBestPages } from "@/lib/best";
import { getAllCards } from "@/lib/api";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import BestV2Client from "./BestV2Client";

export const metadata: Metadata = {
  title: "Best Credit Cards of 2026",
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

  const totalIssuers = new Set(
    cards.map((c) => c.bank?.trim()).filter(Boolean)
  ).size;

  // Top-3 card image previews per ranking page (mirrors the landing page).
  const cardImageBySlug = new Map<string, string | undefined>();
  const cardNameBySlug = new Map<string, string>();
  for (const c of cards) {
    cardImageBySlug.set(c.slug, c.card_image_link);
    cardNameBySlug.set(c.slug, c.card_name);
  }
  const previews: Record<string, { src?: string; alt: string }[]> = {};
  for (const page of pages) {
    previews[page.slug] = page.cards
      .filter((c) => cardImageBySlug.has(c.slug))
      .slice(0, 3)
      .map((c) => ({
        src: cardImageBySlug.get(c.slug),
        alt: cardNameBySlug.get(c.slug) || c.slug,
      }));
  }

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
      <BestV2Client pages={pages} previews={previews} totalIssuers={totalIssuers} totalCards={cards.length} />
    </>
  );
}
