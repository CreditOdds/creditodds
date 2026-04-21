import { Metadata } from "next";
import { getNews } from "@/lib/news";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import NewsV2Client from "./NewsV2Client";

export const metadata: Metadata = {
  title: "Card News - Credit Card Updates",
  description: "Stay up to date with the latest credit card news, bonus changes, new card launches, and policy updates from major banks.",
  openGraph: {
    title: "Card News | CreditOdds",
    description: "Latest credit card news, bonus changes, and updates from major banks.",
    url: "https://creditodds.com/news",
    type: "website",
  },
  alternates: {
    canonical: "https://creditodds.com/news",
  },
};

// Revalidate every 5 minutes
export const revalidate = 300;

export default async function NewsPage() {
  const newsItems = await getNews();

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Card News",
    description: "Stay up to date with the latest credit card news, bonus changes, new card launches, and policy updates from major banks.",
    url: "https://creditodds.com/news",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: newsItems.slice(0, 10).map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `https://creditodds.com/news/${item.id}`,
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
          { name: 'Card News', url: 'https://creditodds.com/news' },
        ]}
      />
      <NewsV2Client items={newsItems} />
    </>
  );
}
