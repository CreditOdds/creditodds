"use client";

import { ArticleTag, tagLabels, tagColors } from "@/lib/articles";

interface ArticleFiltersProps {
  selectedTags: ArticleTag[];
  onTagToggle: (tag: ArticleTag) => void;
  onClearFilters: () => void;
}

const ALL_TAGS: ArticleTag[] = ['strategy', 'guide', 'analysis', 'news-analysis', 'beginner'];

export function ArticleFilters({ selectedTags, onTagToggle, onClearFilters }: ArticleFiltersProps) {
  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Filter by:</span>
        {ALL_TAGS.map((tag) => {
          const isSelected = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => onTagToggle(tag)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                isSelected
                  ? tagColors[tag]
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tagLabels[tag]}
            </button>
          );
        })}
        {selectedTags.length > 0 && (
          <button
            onClick={onClearFilters}
            className="px-3 py-1.5 rounded-full text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
