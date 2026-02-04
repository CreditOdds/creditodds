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
  author: string;
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
