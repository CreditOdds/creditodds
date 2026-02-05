import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CalendarIcon, UserIcon, ClockIcon, ArrowPathIcon, BanknotesIcon } from "@heroicons/react/24/outline";
import { getArticle, getArticles, getRelatedArticles, tagLabels, tagColors, ArticleTag, generateAuthorSlug } from "@/lib/articles";
import { ArticleContent } from "@/components/articles/ArticleContent";
import { RelatedCards } from "@/components/articles/RelatedCards";
import { TableOfContents } from "@/components/articles/TableOfContents";
import { ReadingProgressBar } from "@/components/articles/ReadingProgressBar";
import { ShareButtons } from "@/components/articles/ShareButtons";
import { RelatedArticles } from "@/components/articles/RelatedArticles";

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

function TagBadge({ tag }: { tag: ArticleTag }) {
  return (
    <Link
      href={`/articles/category/${tag}`}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tagColors[tag]} hover:opacity-80 transition-opacity`}
    >
      {tagLabels[tag]}
    </Link>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    return {
      title: "Article Not Found",
    };
  }

  const openGraphImages = article.image
    ? [{ url: `https://d2hxvzw7msbtvt.cloudfront.net/article_images/${article.image}` }]
    : undefined;

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
      images: openGraphImages,
    },
    alternates: {
      canonical: `https://creditodds.com/articles/${article.slug}`,
    },
  };
}

export async function generateStaticParams() {
  const articles = await getArticles();
  return articles.map((article) => ({
    slug: article.slug,
  }));
}

// Revalidate every 5 minutes
export const revalidate = 300;

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    notFound();
  }

  const relatedArticles = await getRelatedArticles(article, 3);
  const authorSlug = article.author_slug || generateAuthorSlug(article.author);
  const articleUrl = `https://creditodds.com/articles/${article.slug}`;

  // Schema.org Article structured data
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.summary,
    author: {
      "@type": "Person",
      name: article.author,
    },
    datePublished: article.date,
    dateModified: article.updated_at || article.date,
    publisher: {
      "@type": "Organization",
      name: "CreditOdds",
      url: "https://creditodds.com",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
  };

  if (article.image) {
    jsonLd.image = `https://d2hxvzw7msbtvt.cloudfront.net/article_images/${article.image}`;
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <ReadingProgressBar />

      <div className="min-h-screen bg-gray-50">
        {/* Breadcrumbs */}
        <nav className="bg-white border-b border-gray-200" aria-label="Breadcrumb">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ol className="flex items-center space-x-4 py-4">
              <li>
                <Link href="/" className="text-gray-400 hover:text-gray-500">
                  Home
                </Link>
              </li>
              <li>
                <div className="flex items-center">
                  <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
                  </svg>
                  <Link href="/articles" className="ml-4 text-gray-400 hover:text-gray-500">
                    Articles
                  </Link>
                </div>
              </li>
              <li>
                <div className="flex items-center">
                  <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
                  </svg>
                  <span className="ml-4 text-sm font-medium text-gray-500 truncate sm:whitespace-normal">
                    {article.title}
                  </span>
                </div>
              </li>
            </ol>
          </div>
        </nav>

        <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Article Header */}
          <header className="mb-10">
            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {article.tags.map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
            </div>

            {/* Title */}
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-6">
              {article.title}
            </h1>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-4">
              <Link
                href={`/articles/author/${authorSlug}`}
                className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors"
              >
                <UserIcon className="h-4 w-4" />
                <span>{article.author}</span>
              </Link>
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="h-4 w-4" />
                <span>{formatDate(article.date)}</span>
              </div>
              {article.updated_at && article.updated_at !== article.date && (
                <div className="flex items-center gap-1.5 text-green-600">
                  <ArrowPathIcon className="h-4 w-4" />
                  <span>Updated {formatDate(article.updated_at)}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <ClockIcon className="h-4 w-4" />
                <span>{article.reading_time} min read</span>
              </div>
            </div>

            {/* Estimated Value */}
            {article.estimated_value && (
              <div className="flex items-center gap-2 text-sm bg-green-50 text-green-700 px-3 py-2 rounded-lg mb-4 inline-flex">
                <BanknotesIcon className="h-4 w-4" />
                <span>Potential value: <strong>{article.estimated_value}</strong></span>
              </div>
            )}

            {/* Share Buttons */}
            <div className="pt-2">
              <ShareButtons title={article.title} url={articleUrl} />
            </div>
          </header>

          {/* Hero Image */}
          {article.image && (
            <div className="mb-8 rounded-lg overflow-hidden shadow-sm border border-gray-200">
              <Image
                src={`https://d2hxvzw7msbtvt.cloudfront.net/article_images/${article.image}`}
                alt={article.image_alt || article.title}
                width={896}
                height={504}
                className="w-full h-auto object-cover"
                priority
                sizes="(max-width: 896px) 100vw, 896px"
              />
            </div>
          )}

          {/* Article Content */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-10">
            {/* Table of Contents */}
            <TableOfContents content={article.content} />

            <ArticleContent content={article.content} />

            {/* Related Cards */}
            {article.related_cards_info && article.related_cards_info.length > 0 && (
              <RelatedCards cards={article.related_cards_info} />
            )}

            {/* Related Articles */}
            <RelatedArticles articles={relatedArticles} />
          </div>

          {/* Back Link */}
          <div className="mt-8 text-center">
            <Link
              href="/articles"
              className="inline-flex items-center text-indigo-600 hover:text-indigo-800 font-medium"
            >
              <svg className="h-5 w-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Articles
            </Link>
          </div>
        </article>
      </div>
    </>
  );
}
