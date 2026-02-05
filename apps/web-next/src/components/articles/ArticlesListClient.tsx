"use client";

import { useState, useMemo } from "react";
import { Article, ArticleTag } from "@/lib/articles";
import { ArticleCard } from "./ArticleCard";
import { ArticleFilters } from "./ArticleFilters";
import { Pagination } from "./Pagination";

const ARTICLES_PER_PAGE = 9;

interface ArticlesListClientProps {
  articles: Article[];
  initialTag?: ArticleTag;
}

export function ArticlesListClient({ articles, initialTag }: ArticlesListClientProps) {
  const [selectedTags, setSelectedTags] = useState<ArticleTag[]>(
    initialTag ? [initialTag] : []
  );
  const [currentPage, setCurrentPage] = useState(1);

  const filteredArticles = useMemo(() => {
    if (selectedTags.length === 0) return articles;
    return articles.filter(article =>
      selectedTags.some(tag => article.tags.includes(tag))
    );
  }, [articles, selectedTags]);

  const totalPages = Math.ceil(filteredArticles.length / ARTICLES_PER_PAGE);
  const paginatedArticles = filteredArticles.slice(
    (currentPage - 1) * ARTICLES_PER_PAGE,
    currentPage * ARTICLES_PER_PAGE
  );

  const handleTagToggle = (tag: ArticleTag) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handleClearFilters = () => {
    setSelectedTags([]);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <ArticleFilters
        selectedTags={selectedTags}
        onTagToggle={handleTagToggle}
        onClearFilters={handleClearFilters}
      />

      {paginatedArticles.length > 0 ? (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {paginatedArticles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />

          <p className="text-center text-sm text-gray-500 mt-4">
            Showing {paginatedArticles.length} of {filteredArticles.length} article{filteredArticles.length !== 1 ? 's' : ''}
          </p>
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">No articles found with the selected filters.</p>
          <button
            onClick={handleClearFilters}
            className="mt-4 text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Clear filters
          </button>
        </div>
      )}
    </>
  );
}
