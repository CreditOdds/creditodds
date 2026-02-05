import Link from "next/link";
import { Article, ArticleTag, tagLabels, tagColors } from "@/lib/articles";

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function TagBadge({ tag }: { tag: ArticleTag }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tagColors[tag]}`}>
      {tagLabels[tag]}
    </span>
  );
}

interface RelatedArticlesProps {
  articles: Article[];
}

export function RelatedArticles({ articles }: RelatedArticlesProps) {
  if (articles.length === 0) return null;

  return (
    <div className="mt-12 pt-8 border-t border-gray-200">
      <h3 className="text-xl font-bold text-gray-900 mb-6">Related Articles</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <Link
            key={article.id}
            href={`/articles/${article.slug}`}
            className="block bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
          >
            <div className="flex flex-wrap gap-1 mb-2">
              {article.tags.slice(0, 2).map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
            </div>
            <h4 className="font-semibold text-gray-900 line-clamp-2 mb-2">
              {article.title}
            </h4>
            <div className="text-xs text-gray-500">
              {formatDate(article.date)} · {article.reading_time} min read
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
