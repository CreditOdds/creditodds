import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArticles, getUniqueAuthors, generateAuthorSlug } from "@/lib/articles";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../../../landing.css";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const articles = await getArticles();
  const authors = getUniqueAuthors(articles);
  const author = authors.find(a => a.slug === slug);
  if (!author) return { title: "Author Not Found" };
  return {
    title: `Articles by ${author.name} | CreditOdds`,
    description: `Read ${author.count} article${author.count !== 1 ? 's' : ''} by ${author.name} about credit card strategies and guides.`,
    openGraph: {
      title: `Articles by ${author.name} | CreditOdds`,
      description: `Credit card guides and strategies by ${author.name}.`,
      url: `https://creditodds.com/articles/author/${slug}`,
      type: "website",
    },
    alternates: {
      canonical: `https://creditodds.com/articles/author/${slug}`,
    },
  };
}

export async function generateStaticParams() {
  const articles = await getArticles();
  const authors = getUniqueAuthors(articles);
  return authors.map((author) => ({ slug: author.slug }));
}

export const revalidate = 300;

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params;
  const allArticles = await getArticles();
  const authors = getUniqueAuthors(allArticles);
  const author = authors.find(a => a.slug === slug);
  if (!author) notFound();

  const articles = allArticles.filter(article => {
    const articleAuthorSlug = article.author_slug || generateAuthorSlug(article.author);
    return articleAuthorSlug === slug;
  });

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Articles by ${author.name}`,
    description: `Read ${author.count} article${author.count !== 1 ? 's' : ''} by ${author.name} about credit card strategies and guides.`,
    url: `https://creditodds.com/articles/author/${slug}`,
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
          { name: author.name, url: `https://creditodds.com/articles/author/${slug}` },
        ]}
      />

      <section className="page-hero wrap">
        <div className="eyebrow">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent)',
            }}
          />
          <span>Articles · by author</span>
        </div>
        <h1 className="page-title">
          Everything by <em>{author.name}.</em>
        </h1>
        <p className="page-sub">
          {author.count} article{author.count !== 1 ? 's' : ''} on credit card strategy,
          data takes, and card teardowns.
        </p>
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
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
            }}
          >
            No articles from this author yet.
          </div>
        )}
      </div>
      <V2Footer />
    </div>
  );
}
