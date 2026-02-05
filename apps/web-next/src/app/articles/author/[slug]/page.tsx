import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserIcon } from "@heroicons/react/24/outline";
import { getArticles, getUniqueAuthors, generateAuthorSlug } from "@/lib/articles";
import { ArticleCard } from "@/components/articles/ArticleCard";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const articles = await getArticles();
  const authors = getUniqueAuthors(articles);
  const author = authors.find(a => a.slug === slug);

  if (!author) {
    return { title: "Author Not Found" };
  }

  return {
    title: `Articles by ${author.name} | CreditOdds`,
    description: `Read ${author.count} article${author.count !== 1 ? 's' : ''} by ${author.name} about credit card strategies and guides.`,
    openGraph: {
      title: `Articles by ${author.name} | CreditOdds`,
      description: `Credit card guides and strategies by ${author.name}.`,
      url: `https://creditodds.com/articles/author/${slug}`,
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

// Revalidate every 5 minutes
export const revalidate = 300;

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params;
  const allArticles = await getArticles();
  const authors = getUniqueAuthors(allArticles);
  const author = authors.find(a => a.slug === slug);

  if (!author) {
    notFound();
  }

  const articles = allArticles.filter(article => {
    const articleAuthorSlug = article.author_slug || generateAuthorSlug(article.author);
    return articleAuthorSlug === slug;
  });

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
                <span className="ml-4 text-sm font-medium text-gray-500">{author.name}</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center mb-4">
            <div className="h-20 w-20 rounded-full bg-indigo-100 flex items-center justify-center">
              <UserIcon className="h-10 w-10 text-indigo-600" />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            {author.name}
          </h1>
          <p className="mt-2 text-lg text-gray-500">
            {author.count} article{author.count !== 1 ? 's' : ''} published
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
            <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No articles yet</h3>
            <p className="mt-1 text-sm text-gray-500">Check back soon for new articles.</p>
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
