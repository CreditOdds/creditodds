import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getArticle, getArticles, getRelatedArticles, tagLabels, ArticleTag, generateAuthorSlug } from "@/lib/articles";
import { ArticleContent } from "@/components/articles/ArticleContent";
import { RelatedCards } from "@/components/articles/RelatedCards";
import { TableOfContents } from "@/components/articles/TableOfContents";
import { ReadingProgressBar } from "@/components/articles/ReadingProgressBar";
import { ShareButtons } from "@/components/articles/ShareButtons";
import { RelatedArticles } from "@/components/articles/RelatedArticles";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../../landing.css";

interface Props {
  params: Promise<{ slug: string }>;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function stripEmoji(label: string): string {
  return label.replace(/^[^\w]+\s*/, '');
}

function TagChip({ tag }: { tag: ArticleTag }) {
  return (
    <Link
      href={`/articles/category/${tag}`}
      className="tag"
      style={{ textDecoration: 'none' }}
    >
      {stripEmoji(tagLabels[tag])}
    </Link>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Article Not Found" };
  return {
    title: article.seo_title || `${article.title} | CreditOdds`,
    description: article.seo_description || article.summary,
    openGraph: {
      title: article.seo_title || article.title,
      description: article.seo_description || article.summary,
      url: `https://creditodds.com/articles/${article.slug}`,
      type: "article",
      publishedTime: article.date,
      modifiedTime: article.updated_at || article.date,
      authors: [article.author],
    },
    alternates: {
      canonical: `https://creditodds.com/articles/${article.slug}`,
    },
  };
}

export async function generateStaticParams() {
  const articles = await getArticles();
  return articles.map((article) => ({ slug: article.slug }));
}

export const revalidate = 300;

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  const relatedArticles = await getRelatedArticles(article, 3);
  const authorSlug = article.author_slug || generateAuthorSlug(article.author);
  const articleUrl = `https://creditodds.com/articles/${article.slug}`;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.summary,
    author: {
      "@type": "Person",
      name: article.author,
      url: `https://creditodds.com/articles/author/${authorSlug}`,
    },
    datePublished: article.date,
    dateModified: article.updated_at || article.date,
    image: article.image
      ? `https://d2hxvzw7msbtvt.cloudfront.net/article_images/${article.image}`
      : `https://creditodds.com/articles/${article.slug}/opengraph-image`,
    publisher: {
      "@type": "Organization",
      name: "CreditOdds",
      url: "https://creditodds.com",
      logo: { "@type": "ImageObject", url: "https://creditodds.com/logo.png" },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl },
    isAccessibleForFree: true,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: 'Articles', url: 'https://creditodds.com/articles' },
          { name: article.title, url: articleUrl },
        ]}
      />
      <ReadingProgressBar />

      <div className="landing-v2 articles-v2">
        <article className="article-layout">
          <Link href="/articles" className="article-back" style={{ marginTop: 24, marginBottom: 14 }}>
            ← Back to Articles
          </Link>

          <div className="article-tags">
            {article.tags.map((tag) => (
              <TagChip key={tag} tag={tag} />
            ))}
          </div>

          <h1 className="article-title">{article.title}</h1>

          <div className="article-meta">
            <Link
              href={`/articles/author/${authorSlug}`}
              style={{ color: 'var(--ink)', textDecoration: 'none', borderBottom: '1px solid transparent' }}
            >
              <b>{article.author}</b>
            </Link>
            <span>·</span>
            <time dateTime={article.date}>{formatDate(article.date)}</time>
            {article.updated_at && article.updated_at !== article.date && (
              <>
                <span>·</span>
                <span style={{ color: 'var(--accent)' }}>
                  Updated {formatDate(article.updated_at)}
                </span>
              </>
            )}
            <span>·</span>
            <span>{article.reading_time} min read</span>
          </div>

          {article.estimated_value && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 999,
                background: 'var(--accent-2)',
                color: 'var(--accent)',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              Potential value · <b>{article.estimated_value}</b>
            </div>
          )}

          <div style={{ marginBottom: 28 }}>
            <ShareButtons title={article.title} url={articleUrl} />
          </div>

          {article.image && (
            <figure
              style={{
                margin: '0 0 32px',
                padding: 0,
                background: 'transparent',
                border: '1px solid var(--line-2)',
                borderRadius: 14,
                overflow: 'hidden',
              }}
            >
              <Image
                src={`https://d2hxvzw7msbtvt.cloudfront.net/article_images/${article.image}`}
                alt={article.image_alt || article.title}
                width={1080}
                height={608}
                className="w-full h-auto"
                style={{ display: 'block' }}
                priority
                sizes="(max-width: 1080px) 100vw, 1080px"
              />
            </figure>
          )}

          <div className="article-body">
            <TableOfContents content={article.content} />
            <ArticleContent content={article.content} />

            {article.related_cards_info && article.related_cards_info.length > 0 && (
              <RelatedCards cards={article.related_cards_info} />
            )}

            <RelatedArticles articles={relatedArticles} />
          </div>
        </article>
        <V2Footer />
      </div>
    </>
  );
}
