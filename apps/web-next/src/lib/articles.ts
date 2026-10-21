// Articles API types and fetching
import { getContentCollection } from './contentCollection';

import type { ArticleTag } from './articleTags';
export { type ArticleTag, tagLabels, tagColors, tagDescriptions } from './articleTags';

export interface RelatedCardInfo {
  slug: string;
  name: string;
  image: string;
  bank: string;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  date: string;
  updated_at?: string;
  author: string;
  author_slug?: string;
  summary: string;
  tags: ArticleTag[];
  related_cards?: string[];
  related_cards_info?: RelatedCardInfo[];
  seo_title?: string;
  seo_description?: string;
  image?: string;
  image_alt?: string;
  social_image?: string;
  social_title?: string;
  social_image_subject?: string;
  content: string;
  reading_time: number;
  estimated_value?: string;
}

export interface ArticlesResponse {
  generated_at: string;
  count: number;
  articles: Article[];
}

export async function getArticles(signal?: AbortSignal): Promise<Article[]> {
  return getContentCollection<Article>('articles', 'articles', 'slug', signal);
}

export async function getArticle(slug: string): Promise<Article | null> {
  const articles = await getArticles();
  return articles.find(article => article.slug === slug) || null;
}

export async function getArticlesByTag(tag: ArticleTag): Promise<Article[]> {
  const articles = await getArticles();
  return articles.filter(article => article.tags.includes(tag));
}

export async function getArticlesByAuthor(authorSlug: string): Promise<Article[]> {
  const articles = await getArticles();
  return articles.filter(article => article.author_slug === authorSlug);
}

export async function getRelatedArticles(article: Article, limit: number = 3): Promise<Article[]> {
  const articles = await getArticles();

  // Find articles that share tags with the current article, excluding the current article
  const related = articles
    .filter(a => a.id !== article.id)
    .map(a => {
      const sharedTags = a.tags.filter(tag => article.tags.includes(tag));
      return { article: a, score: sharedTags.length };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.article);

  return related;
}

export function getUniqueAuthors(articles: Article[]): { name: string; slug: string; count: number }[] {
  const authorMap = new Map<string, { name: string; slug: string; count: number }>();

  for (const article of articles) {
    const slug = article.author_slug || article.author.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const existing = authorMap.get(slug);
    if (existing) {
      existing.count++;
    } else {
      authorMap.set(slug, { name: article.author, slug, count: 1 });
    }
  }

  return Array.from(authorMap.values()).sort((a, b) => b.count - a.count);
}

export function generateAuthorSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
