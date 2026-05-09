import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getNews, getNewsItem, tagLabels } from "@/lib/news";
import { ArticleContent } from "@/components/articles/ArticleContent";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import { ReadingProgressBar } from "@/components/articles/ReadingProgressBar";
import { RelatedCards } from "@/components/articles/RelatedCards";
import { RelatedCardInfo } from "@/lib/articles";
import CardImage from "@/components/ui/CardImage";
import { V2Footer } from "@/components/landing-v2/Chrome";
import { truncateTitle } from "@/lib/seo";
import "../../landing.css";

interface NewsDetailPageProps {
  params: Promise<{ id: string }>;
}

export const revalidate = 300;

export async function generateStaticParams() {
  const items = await getNews();
  return items.filter(item => item.body).map(item => ({ id: item.id }));
}

export async function generateMetadata({ params }: NewsDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const item = await getNewsItem(id);
  if (!item) return { title: "News Not Found" };
  return {
    title: truncateTitle(item.title),
    description: item.summary,
    openGraph: {
      title: `${item.title} | CreditOdds`,
      description: item.summary,
      url: `https://creditodds.com/news/${item.id}`,
      type: "article",
      publishedTime: item.date,
    },
    alternates: {
      canonical: `https://creditodds.com/news/${item.id}`,
    },
  };
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function NewsDetailPage({ params }: NewsDetailPageProps) {
  const { id } = await params;
  const item = await getNewsItem(id);
  if (!item) notFound();

  const relatedCards: RelatedCardInfo[] = [];
  if (item.card_slugs && item.card_names && item.card_image_links) {
    for (let i = 0; i < item.card_slugs.length; i++) {
      relatedCards.push({
        slug: item.card_slugs[i],
        name: item.card_names[i],
        image: item.card_image_links[i] || '',
        bank: item.bank || '',
      });
    }
  }

  const url = `https://creditodds.com/news/${item.id}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: item.title,
    description: item.summary,
    datePublished: item.date,
    dateModified: item.date,
    url,
    image: `https://creditodds.com/news/${item.id}/opengraph-image`,
    author: { "@type": "Organization", name: "CreditOdds" },
    publisher: {
      "@type": "Organization",
      name: "CreditOdds",
      url: "https://creditodds.com",
      logo: { "@type": "ImageObject", url: "https://creditodds.com/logo.png" },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    isAccessibleForFree: true,
  };

  return (
    <>
      <ReadingProgressBar />
      <div className="landing-v2">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <BreadcrumbSchema
          items={[
            { name: 'Home', url: 'https://creditodds.com' },
            { name: 'Card News', url: 'https://creditodds.com/news' },
            { name: item.title, url: `https://creditodds.com/news/${item.id}` },
          ]}
        />

        <article className="article-layout wide">
          <Link href="/news" className="article-back" style={{ marginTop: 24, marginBottom: 14 }}>
            ← Back to Card News
          </Link>

          <div className="article-tags">
            {item.tags.map((tag) => (
              <span key={tag} className="tag">
                {tagLabels[tag].replace(/^[^\w]+\s*/, '')}
              </span>
            ))}
          </div>

          <h1 className="article-title">{item.title}</h1>

          <div className="article-meta">
            <time dateTime={item.date}>
              <b>{formatDate(item.date)}</b>
            </time>
            {item.bank && (
              <>
                <span>·</span>
                <span>{item.bank}</span>
              </>
            )}
          </div>

          {item.card_slugs && item.card_names && item.card_slugs.length > 0 && (
            <div className="article-card-chips">
              {item.card_slugs.map((slug, i) => (
                <Link key={slug} href={`/card/${slug}`} className="article-card-chip">
                  <span className="thumb">
                    <CardImage
                      cardImageLink={item.card_image_links?.[i]}
                      alt={item.card_names![i]}
                      fill
                      sizes="28px"
                      style={{ objectFit: 'cover' }}
                    />
                  </span>
                  {item.card_names![i]}
                </Link>
              ))}
            </div>
          )}

          <div className="article-body">
            {item.body ? (
              <ArticleContent content={item.body} />
            ) : (
              <p style={{ color: 'var(--ink-2)', fontSize: 17, lineHeight: 1.6, margin: 0 }}>
                {item.summary}
              </p>
            )}

            {relatedCards.length > 0 && <RelatedCards cards={relatedCards} />}
          </div>

          {item.source_url && (
            <div className="article-source">
              Source:
              <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                {item.source || item.source_url}
              </a>
            </div>
          )}
        </article>
        <V2Footer />
      </div>
    </>
  );
}
