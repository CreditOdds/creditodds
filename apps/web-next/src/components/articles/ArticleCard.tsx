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

interface ArticleCardProps {
  article: Article;
}

export function ArticleCard({ article }: ArticleCardProps) {
  return (
    <Link
      href={`/articles/${article.slug}`}
      className="block bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-indigo-300 transition-all duration-200"
    >
      <div className="p-5">
        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {article.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
        </div>

        {/* Title */}
        <h2 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
          {article.title}
        </h2>

        {/* Summary */}
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">
          {article.summary}
        </p>

        {/* Meta */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span>{article.author}</span>
            <span className="text-gray-300">|</span>
            <span>{formatDate(article.date)}</span>
          </div>
          <span>{article.reading_time} min read</span>
        </div>
      </div>
    </Link>
  );
}
