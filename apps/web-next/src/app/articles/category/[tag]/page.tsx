import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TagIcon } from "@heroicons/react/24/outline";
import { getArticlesByTag, tagLabels, tagColors, tagDescriptions, ArticleTag } from "@/lib/articles";
import { ArticleCard } from "@/components/articles/ArticleCard";

interface Props {
  params: Promise<{ tag: string }>;
}

const VALID_TAGS: ArticleTag[] = ['strategy', 'guide', 'analysis', 'news-analysis', 'beginner'];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params;

  if (!VALID_TAGS.includes(tag as ArticleTag)) {
    return { title: "Category Not Found" };
  }

  const tagLabel = tagLabels[tag as ArticleTag];
  const tagDescription = tagDescriptions[tag as ArticleTag];

  return {
    title: `${tagLabel} Articles | CreditOdds`,
    description: tagDescription,
    openGraph: {
      title: `${tagLabel} Articles | CreditOdds`,
      description: tagDescription,
      url: `https://creditodds.com/articles/category/${tag}`,
    },
    alternates: {
      canonical: `https://creditodds.com/articles/category/${tag}`,
    },
  };
}

export async function generateStaticParams() {
  return VALID_TAGS.map((tag) => ({ tag }));
}

// Revalidate every 5 minutes
export const revalidate = 300;

export default async function CategoryPage({ params }: Props) {
  const { tag } = await params;

  if (!VALID_TAGS.includes(tag as ArticleTag)) {
    notFound();
  }

  const articles = await getArticlesByTag(tag as ArticleTag);
  const tagLabel = tagLabels[tag as ArticleTag];
  const tagDescription = tagDescriptions[tag as ArticleTag];
  const tagColor = tagColors[tag as ArticleTag];

  return (
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
                <span className="ml-4 text-sm font-medium text-gray-500">{tagLabel}</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${tagColor}`}>
              <TagIcon className="h-4 w-4 mr-1.5" />
              {tagLabel}
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl mt-4">
            {tagLabel} Articles
          </h1>
          <p className="mt-2 text-lg text-gray-500 max-w-2xl mx-auto">
            {tagDescription}
          </p>
        </div>

        {/* Articles Grid */}
        {articles.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <TagIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No articles yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Check back soon for {tagLabel.toLowerCase()} articles.
            </p>
          </div>
        )}

        {/* Back Link */}
        <div className="mt-8 text-center">
          <Link
            href="/articles"
            className="inline-flex items-center text-indigo-600 hover:text-indigo-800 font-medium"
          >
            <svg className="h-5 w-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            View All Articles
          </Link>
        </div>
      </div>
    </div>
  );
}
