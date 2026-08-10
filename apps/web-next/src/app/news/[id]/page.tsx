import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getNews, getNewsCards, getNewsItem, tagLabels } from "@/lib/news";
import { getContentViewCounts } from "@/lib/api";
import { ArticleContent } from "@/components/articles/ArticleContent";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import { ReadingProgressBar } from "@/components/articles/ReadingProgressBar";
import { RelatedCards } from "@/components/articles/RelatedCards";
import { ReplacementCards } from "@/components/ui/ReplacementCards";
import { RelatedCardInfo } from "@/lib/articles";
import CardImage from "@/components/ui/CardImage";
import { V2Footer } from "@/components/landing-v2/Chrome";
import { FollowXCallout } from "@/components/landing-v2/FollowXCallout";
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
      ...(item.updated ? { modifiedTime: item.updated } : {}),
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
    // YYYY-MM-DD parses as UTC midnight; format in UTC or the shown day
    // rolls back one on servers west of Greenwich.
    timeZone: 'UTC',
  });
}

export default async function NewsDetailPage({ params }: NewsDetailPageProps) {
  const { id } = await params;
  const item = await getNewsItem(id);
  if (!item) notFound();

  // All-time views, shown only once past a floor so fresh posts don't
  // advertise low numbers.
  const viewCounts = await getContentViewCounts(0).catch(() => null);
  const viewCount = viewCounts?.news[item.id] ?? 0;

  const newsCards = getNewsCards(item);

  // Skip entries with no resolved image (card missing from cards.json at build
  // time), which would otherwise render as a blank gray placeholder. Better to
  // show nothing than broken art.
  const relatedCards: RelatedCardInfo[] = newsCards
    .filter((card) => card.image)
    .map((card) => ({
      slug: card.slug,
      name: card.name,
      image: card.image as string,
      bank: item.bank || '',
    }));

  const url = `https://creditodds.com/news/${item.id}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: item.title,
    description: item.summary,
    datePublished: item.date,
    dateModified: item.updated ?? item.date,
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
            {item.updated && (
              <>
                <span>·</span>
                <time dateTime={item.updated}>
                  Updated <b>{formatDate(item.updated)}</b>
                </time>
              </>
            )}
            {item.bank && (
              <>
                <span>·</span>
                <span>{item.bank}</span>
              </>
            )}
            {viewCount > 100 && (
              <>
                <span>·</span>
                <span>{viewCount.toLocaleString('en-US')} views</span>
              </>
            )}
          </div>

          {newsCards.length > 0 && (
            <div className="article-card-chips">
              {newsCards.map((card) => (
                <Link key={card.slug} href={`/card/${card.slug}`} className="article-card-chip">
                  <span className="thumb">
                    <CardImage
                      cardImageLink={card.image ?? undefined}
                      alt={card.name}
                      fill
                      sizes="28px"
                      style={{ objectFit: 'cover' }}
                    />
                  </span>
                  {card.name}
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

            {/* Sits above Related Cards on purpose: on a story about a card
                that is gone, "what can I get instead" is the reader's actual
                next question, and Related Cards points at the dead card. */}
            <ReplacementCards
              cards={item.replacement_cards_info ?? []}
              surface="news"
              sourceId={item.id}
            />

            {relatedCards.length > 0 && <RelatedCards cards={relatedCards} />}
          </div>

          {item.source && (
            <div className="article-source">
              Source: <span>{item.source}</span>
            </div>
          )}

          <div className="article-follow">
            <FollowXCallout sub="Don't miss an update" />
          </div>
        </article>
        <V2Footer />
      </div>
    </>
  );
}
