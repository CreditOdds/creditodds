import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { NewspaperIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import { getNews, getNewsItem, tagLabels, tagColors } from "@/lib/news";
import { ArticleContent } from "@/components/articles/ArticleContent";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";

interface NewsDetailPageProps {
  params: Promise<{ id: string }>;
}

export const revalidate = 300;

export async function generateStaticParams() {
  const items = await getNews();
  return items
    .filter(item => item.body)
    .map(item => ({ id: item.id }));
}

export async function generateMetadata({ params }: NewsDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const item = await getNewsItem(id);

  if (!item) {
    return { title: "News Not Found" };
  }

  return {
    title: `${item.title} | Card News`,
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

  if (!item) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: item.title,
    description: item.summary,
    datePublished: item.date,
    url: `https://creditodds.com/news/${item.id}`,
    publisher: {
      "@type": "Organization",
      name: "CreditOdds",
      url: "https://creditodds.com",
    },
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: 'Card News', url: 'https://creditodds.com/news' },
        { name: item.title, url: `https://creditodds.com/news/${item.id}` },
      ]} />

      {/* Breadcrumbs */}
      <nav className="bg-white border-b border-gray-200" aria-label="Breadcrumb">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
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
                <Link href="/news" className="ml-4 text-sm font-medium text-gray-400 hover:text-gray-500">
                  Card News
                </Link>
              </div>
            </li>
            <li>
              <div className="flex items-center">
                <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
                </svg>
                <span className="ml-4 text-sm font-medium text-gray-500 line-clamp-1">{item.title}</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      {/* Article */}
      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="mb-8">
          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-4">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${tagColors[tag]}`}
              >
                {tagLabels[tag]}
              </span>
            ))}
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            {item.title}
          </h1>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-sm text-gray-500">
            <time dateTime={item.date}>{formatDate(item.date)}</time>
            {item.bank && (
              <>
                <span className="text-gray-300">|</span>
                <span>{item.bank}</span>
              </>
            )}
          </div>

          {/* Card links */}
          {item.card_slugs && item.card_names && item.card_slugs.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {item.card_slugs.map((slug, i) => (
                <Link
                  key={slug}
                  href={`/card/${slug}`}
                  className="inline-flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium hover:bg-indigo-100 transition-colors"
                >
                  {item.card_names![i]}
                </Link>
              ))}
            </div>
          )}
        </header>

        {/* Body */}
        <div className="bg-white shadow rounded-lg p-6 sm:p-8">
          {item.body ? (
            <ArticleContent content={item.body} />
          ) : (
            <p className="text-gray-600 text-lg leading-relaxed">{item.summary}</p>
          )}
        </div>

        {/* Source attribution */}
        {item.source_url && (
          <div className="mt-6 p-4 bg-gray-100 rounded-lg">
            <p className="text-sm text-gray-500">
              Source:{' '}
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-800 underline"
              >
                {item.source || item.source_url}
              </a>
            </p>
          </div>
        )}

        {/* Back link */}
        <div className="mt-8">
          <Link
            href="/news"
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Card News
          </Link>
        </div>
      </article>
    </div>
  );
}
