import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArticlesByTag, tagLabels, tagDescriptions, ArticleTag } from "@/lib/articles";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../../../landing.css";

interface Props {
  params: Promise<{ tag: string }>;
}

const VALID_TAGS: ArticleTag[] = ['strategy', 'guide', 'analysis', 'news-analysis', 'beginner'];

function stripEmoji(label: string): string {
  return label.replace(/^[^\w]+\s*/, '');
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params;
  if (!VALID_TAGS.includes(tag as ArticleTag)) return { title: "Category Not Found" };
  const tagLabel = tagLabels[tag as ArticleTag];
  const tagDescription = tagDescriptions[tag as ArticleTag];
  return {
    title: `${stripEmoji(tagLabel)} Articles | CreditOdds`,
    description: tagDescription,
    openGraph: {
      title: `${stripEmoji(tagLabel)} Articles | CreditOdds`,
      description: tagDescription,
      url: `https://creditodds.com/articles/category/${tag}`,
      type: "website",
    },
    alternates: {
      canonical: `https://creditodds.com/articles/category/${tag}`,
    },
  };
}

export async function generateStaticParams() {
  return VALID_TAGS.map((tag) => ({ tag }));
}

export const revalidate = 300;

export default async function CategoryPage({ params }: Props) {
  const { tag } = await params;
  if (!VALID_TAGS.includes(tag as ArticleTag)) notFound();

  const articles = await getArticlesByTag(tag as ArticleTag);
  const tagLabel = stripEmoji(tagLabels[tag as ArticleTag]);
  const tagDescription = tagDescriptions[tag as ArticleTag];

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${tagLabel} Articles`,
    description: tagDescription,
    url: `https://creditodds.com/articles/category/${tag}`,
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
          { name: tagLabel, url: `https://creditodds.com/articles/category/${tag}` },
        ]}
      />

      <section className="page-hero wrap">
        <h1 className="page-title">{tagLabel} <em>articles.</em></h1>
        <p className="page-sub">{tagDescription}</p>
      </section>

      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 64 }}>
        {articles.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        ) : (
          <div
            style={{
              padding: '80px 0',
              textAlign: 'center',
              color: 'var(--muted)',
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
            }}
          >
            No {tagLabel.toLowerCase()} articles yet.
          </div>
        )}
      </div>
      <V2Footer />
    </div>
  );
}
