// Articles API types and fetching

export type ArticleTag =
  | 'strategy'
  | 'guide'
  | 'analysis'
  | 'news-analysis'
  | 'beginner';

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
  content: string;
  reading_time: number;
  estimated_value?: string;
}

export interface ArticlesResponse {
  generated_at: string;
  count: number;
  articles: Article[];
}

export const tagLabels: Record<ArticleTag, string> = {
  'strategy': 'Strategy',
  'guide': 'Guide',
  'analysis': 'Analysis',
  'news-analysis': 'News Analysis',
  'beginner': 'Beginner',
};

export const tagColors: Record<ArticleTag, string> = {
  'strategy': 'bg-purple-100 text-purple-800',
  'guide': 'bg-blue-100 text-blue-800',
  'analysis': 'bg-green-100 text-green-800',
  'news-analysis': 'bg-orange-100 text-orange-800',
  'beginner': 'bg-teal-100 text-teal-800',
};

export const tagDescriptions: Record<ArticleTag, string> = {
  'strategy': 'Strategic advice for maximizing credit card rewards',
  'guide': 'Step-by-step how-to guides',
  'analysis': 'In-depth card and product analysis',
  'news-analysis': 'Analysis of credit card industry news',
  'beginner': 'Beginner-friendly content for those new to credit cards',
};

const ARTICLES_CDN_URL = 'https://d2hxvzw7msbtvt.cloudfront.net/articles.json';

// Check if running in the browser
const isBrowser = typeof window !== 'undefined';

export async function getArticles(): Promise<Article[]> {
  try {
    // In development on the server, read from local file
    if (!isBrowser && process.env.NODE_ENV === 'development') {
      const fs = await import('fs/promises');
      const path = await import('path');
      const filePath = path.join(process.cwd(), '..', '..', 'data', 'articles.json');
      const fileContent = await fs.readFile(filePath, 'utf8');
      const data: ArticlesResponse = JSON.parse(fileContent);
      return data.articles || [];
    }

    // Use local API route on client to avoid CORS, direct CDN on server
    const url = isBrowser ? '/api/articles' : ARTICLES_CDN_URL;
    const res = await fetch(url, isBrowser ? {} : {
      next: { revalidate: 300 }, // Revalidate every 5 minutes (server only)
    });

    if (!res.ok) {
      console.error('Failed to fetch articles:', res.status);
      return [];
    }

    const data: ArticlesResponse = await res.json();
    return data.articles || [];
  } catch (error) {
    console.error('Error fetching articles:', error);
    return [];
  }
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
