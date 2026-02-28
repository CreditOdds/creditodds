import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { getBestPage, getBestPages } from "@/lib/best";
import { getAllCards } from "@/lib/api";
import { BestCardList } from "@/components/best/BestCardList";
import { ArticleContent } from "@/components/articles/ArticleContent";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getBestPage(slug);

  if (!page) {
    return { title: "Not Found" };
  }

  const title = page.seo_title || `${page.title} | CreditOdds`;
  const description = page.seo_description || page.description;

  return {
    title,
    description,
    openGraph: {
      title: page.seo_title || page.title,
      description,
      url: `https://creditodds.com/best/${page.slug}`,
      type: "article",
      publishedTime: page.date,
      modifiedTime: page.updated_at || page.date,
    },
    alternates: {
      canonical: `https://creditodds.com/best/${page.slug}`,
    },
  };
}

export async function generateStaticParams() {
  const pages = await getBestPages();
  return pages.map((page) => ({
    slug: page.slug,
  }));
}

export const revalidate = 300;

export default async function BestDetailPage({ params }: Props) {
  const { slug } = await params;
  const [page, allCards] = await Promise.all([
    getBestPage(slug),
    getAllCards(),
  ]);

  if (!page) {
    notFound();
  }

  // Build a lookup map from slug to card
  const cardsBySlug = new Map(allCards.map(card => [card.slug, card]));

  // Merge curated card list with live card data
  const enrichedCards = page.cards
    .filter(entry => cardsBySlug.has(entry.slug))
    .map(entry => ({
      ...entry,
      card: cardsBySlug.get(entry.slug)!,
    }));

  const pageUrl = `https://creditodds.com/best/${page.slug}`;

  // ItemList JSON-LD for the ranked card list
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: page.title,
    description: page.description,
    url: pageUrl,
    numberOfItems: enrichedCards.length,
    itemListElement: enrichedCards.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.card.card_name,
      url: `https://creditodds.com/card/${entry.card.slug}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: 'Best Cards', url: 'https://creditodds.com/best' },
        { name: page.title, url: pageUrl },
      ]} />

      <div className="min-h-screen bg-gray-50">
        {/* Breadcrumbs */}
        <nav className="bg-white border-b border-gray-200" aria-label="Breadcrumb">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ol className="flex items-center space-x-4 py-4 overflow-hidden">
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
                  <Link href="/best" className="ml-4 text-gray-400 hover:text-gray-500">
                    Best Cards
                  </Link>
                </div>
              </li>
              <li>
                <div className="flex items-center">
                  <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
                  </svg>
                  <span className="ml-4 text-sm font-medium text-gray-500 truncate">
                    {page.title}
                  </span>
                </div>
              </li>
            </ol>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <header className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-4">
              {page.title}
            </h1>
            <p className="text-lg text-gray-500 mb-4">
              {page.description}
            </p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="h-4 w-4" />
                <span>{formatDate(page.date)}</span>
              </div>
              {page.updated_at && page.updated_at !== page.date && (
                <div className="flex items-center gap-1.5 text-green-600">
                  <ArrowPathIcon className="h-4 w-4" />
                  <span>Updated {formatDate(page.updated_at)}</span>
                </div>
              )}
            </div>
          </header>

          {/* Intro text */}
          {page.intro && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8 mb-8">
              <ArticleContent content={page.intro} />
            </div>
          )}

          {/* Ranked card list */}
          <BestCardList cards={enrichedCards} />

          {/* Back link */}
          <div className="mt-8 text-center">
            <Link
              href="/best"
              className="inline-flex items-center text-indigo-600 hover:text-indigo-800 font-medium"
            >
              <svg className="h-5 w-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Best Cards
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
