import { Metadata } from "next";
import { getBestPages } from "@/lib/best";
import { getAllCards } from "@/lib/api";
import { BreadcrumbSchema, CollectionPageSchema } from "@/components/seo/JsonLd";
import BestV2Client from "./BestV2Client";

export async function generateMetadata(): Promise<Metadata> {
  const pages = await getBestPages();
  const latestUpdate = pages
    .map((p) => p.updated_at || p.date)
    .filter(Boolean)
    .sort()
    .reverse()[0];
  return {
    title: "Best Credit Cards of 2026",
    description: "Curated rankings of the best credit cards of 2026 across categories. Data-driven picks updated with live approval odds and bonus values.",
    openGraph: {
      title: "Best Credit Cards of 2026 | CreditOdds",
      description: "Curated rankings of the best credit cards of 2026 across categories.",
      url: "https://creditodds.com/best",
      type: "article",
      ...(latestUpdate ? { modifiedTime: latestUpdate } : {}),
    },
    alternates: {
      canonical: "https://creditodds.com/best",
    },
  };
}

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

  // Most recent update across all ranking pages — drives the page-level
  // dateModified so Google can surface a freshness date in the SERP.
  const latestUpdate = pages
    .map((p) => p.updated_at || p.date)
    .filter(Boolean)
    .sort()
    .reverse()[0];
  const earliestPublished = pages
    .map((p) => p.date)
    .filter(Boolean)
    .sort()[0];

  return (
    <>
      <CollectionPageSchema
        url="https://creditodds.com/best"
        name="Best Credit Cards"
        description="Curated rankings of the best credit cards across categories."
        datePublished={earliestPublished}
        dateModified={latestUpdate}
        items={pages.slice(0, 10).map((page) => ({
          name: page.title,
          url: `https://creditodds.com/best/${page.slug}`,
        }))}
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
