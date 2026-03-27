import type { Card } from "@/lib/api";
import type { NewsItem } from "@/lib/news";

export interface KeywordMatchOptions {
  include: string[];
  exclude?: string[];
}

function normalize(value: string): string {
  return value.toLowerCase();
}

export function matchesAnyKeyword(value: string, keywords: string[]): boolean {
  const normalizedValue = normalize(value);
  return keywords.some((keyword) => normalizedValue.includes(normalize(keyword)));
}

export function filterCardsByKeywords(cards: Card[], options: KeywordMatchOptions): Card[] {
  return cards.filter((card) => {
    if (card.accepting_applications === false) {
      return false;
    }

    const normalizedName = normalize(card.card_name);
    const matchesInclude = options.include.some((keyword) => normalizedName.includes(normalize(keyword)));
    const matchesExclude = options.exclude?.some((keyword) => normalizedName.includes(normalize(keyword))) ?? false;

    return matchesInclude && !matchesExclude;
  });
}

export function filterNewsByKeywords(items: NewsItem[], keywords: string[]): NewsItem[] {
  return items.filter((item) => matchesAnyKeyword(`${item.title} ${item.summary}`, keywords));
}
