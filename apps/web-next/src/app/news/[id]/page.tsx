import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getNews, getNewsItem, tagLabels } from "@/lib/news";
import { ArticleContent } from "@/components/articles/ArticleContent";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import { ReadingProgressBar } from "@/components/articles/ReadingProgressBar";
import { RelatedCards } from "@/components/articles/RelatedCards";
import { RelatedCardInfo } from "@/lib/articles";
import CardImage from "@/components/ui/CardImage";
import { V2Footer } from "@/components/landing-v2/Chrome";
import ViewTracker from "@/components/ViewTracker";
import { truncateTitle } from "@/lib/seo";
import "../../landing.css";

const NEWS_IMG_CDN = "https://d3ay3etzd1512y.cloudfront.net/news_images";

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
      ...(item.news_image
        ? {
            images: [
              {
                url: `${NEWS_IMG_CDN}/${item.news_image}`,
                width: 1536,
                height: 1024,
                alt: item.title,
              },
            ],
          }
        : {}),
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
  if (item.card_slugs && item.card_names) {
    for (let i = 0; i < item.card_slugs.length; i++) {
      // Skip entries with no resolved image. An empty card_image_links array is
      // truthy, so a stale/partial news.json (image lookup failed at build time)
      // would otherwise render related cards with a blank gray placeholder rather
      // than being omitted. Better to show nothing than broken art.
      const image = item.card_image_links?.[i];
      if (!image) continue;
      relatedCards.push({
        slug: item.card_slugs[i],
        name: item.card_names[i],
        image,
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
    image: item.news_image
      ? `${NEWS_IMG_CDN}/${item.news_image}`
      : `https://creditodds.com/news/${item.id}/opengraph-image`,
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
      <ViewTracker type="news" contentKey={item.id} />
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

        <div className="cj-terminal">
          <nav className="cj-crumbs" aria-label="Breadcrumb">
            <Link href="/news" className="cj-crumb">News</Link>
            <span className="cj-sep">/</span>
            <span className="cj-crumb cj-crumb-current" aria-current="page">{item.title}</span>
          </nav>
          <span className="cj-spacer" />
          <div className="cj-term-actions">
            <span><span className="cj-status-dot" />live</span>
          </div>
        </div>

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

          {item.news_image && (
            <figure
              style={{
                position: 'relative',
                aspectRatio: '3 / 2',
                margin: '22px 0 8px',
                borderRadius: 16,
                overflow: 'hidden',
                border: '1px solid var(--line, rgba(0,0,0,0.08))',
              }}
            >
              <Image
                src={`${NEWS_IMG_CDN}/${item.news_image}`}
                alt={item.title}
                fill
                sizes="(max-width: 820px) 100vw, 760px"
                style={{ objectFit: 'cover' }}
                priority
              />
            </figure>
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

          {item.source && (
            <div className="article-source">
              Source: <span>{item.source}</span>
            </div>
          )}
        </article>
        <V2Footer />
      </div>
    </>
  );
}
