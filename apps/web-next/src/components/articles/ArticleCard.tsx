import Link from "next/link";
import Image from "next/image";
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
  const imageUrl = article.image
    ? `https://d3ay3etzd1512y.cloudfront.net/article_images/${article.image}`
    : null;

  return (
    <Link
      href={`/articles/${article.slug}`}
      className="block bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-indigo-300 transition-all duration-200 overflow-hidden"
    >
      {imageUrl ? (
        <div
          className="relative w-full"
          style={{ aspectRatio: '3 / 2', background: '#1a1330' }}
        >
          <Image
            src={imageUrl}
            alt={article.image_alt || article.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        </div>
      ) : (
        <div
          className="w-full"
          style={{
            aspectRatio: '3 / 2',
            background:
              'linear-gradient(135deg, #1a1330 0%, #2d1b69 60%, #6d3fe8 100%)',
          }}
          aria-hidden
        />
      )}
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
