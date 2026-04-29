import { Metadata } from "next";
import { getArticles } from "@/lib/articles";
import { ArticlesListClient } from "@/components/articles/ArticlesListClient";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../landing.css";

export const metadata: Metadata = {
  title: "Credit Card Articles - Guides & Strategies",
  description: "In-depth guides, strategies, and analysis to help you maximize your credit card rewards and make smarter financial decisions.",
  openGraph: {
    title: "Credit Card Articles | CreditOdds",
    description: "Guides, strategies, and analysis for credit card rewards optimization.",
    url: "https://creditodds.com/articles",
    type: "website",
  },
  alternates: {
    canonical: "https://creditodds.com/articles",
  },
};

export const revalidate = 300;

export default async function ArticlesPage() {
  const articles = await getArticles();

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Credit Card Articles",
    description: "In-depth guides, strategies, and analysis to help you maximize your credit card rewards and make smarter financial decisions.",
    url: "https://creditodds.com/articles",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: articles.slice(0, 10).map((article, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `https://creditodds.com/articles/${article.slug}`,
      })),
    },
  };

  return (
    <div className="landing-v2 articles-v2">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: 'Articles', url: 'https://creditodds.com/articles' },
        ]}
      />

      <section className="page-hero wrap">
        <h1 className="page-title">
          Deeper reads, <em>same data discipline.</em>
        </h1>
        <p className="page-sub">
          Long-form guides, teardowns, and strategies for getting the most out of your
          credit cards — grounded in the community database, not affiliate marketing.
        </p>
      </section>

      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 80 }}>
        {articles.length > 0 ? (
          <ArticlesListClient articles={articles} />
        ) : (
          <div
            style={{
              padding: '80px 0',
              textAlign: 'center',
              color: 'var(--muted)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
            }}
          >
            No articles yet. Check back soon.
          </div>
        )}
      </div>
      <V2Footer />
    </div>
  );
}
