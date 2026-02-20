// News API types and fetching

export type NewsTag =
  | 'new-card'
  | 'discontinued'
  | 'bonus-change'
  | 'fee-change'
  | 'benefit-change'
  | 'limited-time'
  | 'policy-change'
  | 'general';

export interface NewsItem {
  id: string;
  date: string;
  title: string;
  summary: string;
  tags: NewsTag[];
  bank?: string;
  card_slug?: string;
  card_name?: string;
  card_image_link?: string;
  card_slugs?: string[];
  card_names?: string[];
  card_image_links?: string[];
  source?: string;
  source_url?: string;
  body?: string;
}

export interface NewsResponse {
  generated_at: string;
  count: number;
  items: NewsItem[];
}

export const tagLabels: Record<NewsTag, string> = {
  'new-card': '🆕 New Card',
  'discontinued': '🚫 Discontinued',
  'bonus-change': '🎁 Bonus Change',
  'fee-change': '💰 Fee Change',
  'benefit-change': '✨ Benefit Change',
  'limited-time': '⏰ Limited Time',
  'policy-change': '📋 Policy Change',
  'general': '📰 General',
};

export const tagColors: Record<NewsTag, string> = {
  'new-card': 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20',
  'discontinued': 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20',
  'bonus-change': 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20',
  'fee-change': 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20',
  'benefit-change': 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20',
  'limited-time': 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20',
  'policy-change': 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-600/20',
  'general': 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20',
};

const NEWS_CDN_URL = 'https://d2hxvzw7msbtvt.cloudfront.net/news.json';

// Check if running in the browser
const isBrowser = typeof window !== 'undefined';

export async function getNewsItem(id: string): Promise<NewsItem | null> {
  const items = await getNews();
  return items.find(item => item.id === id) || null;
}

export async function getNews(): Promise<NewsItem[]> {
  try {
    // In development on the server, read from local file
    if (!isBrowser && process.env.NODE_ENV === 'development') {
      const fs = await import('fs/promises');
      const path = await import('path');
      const filePath = path.join(process.cwd(), '..', '..', 'data', 'news.json');
      const fileContent = await fs.readFile(filePath, 'utf8');
      const data: NewsResponse = JSON.parse(fileContent);
      return data.items || [];
    }

    // Use local API route on client to avoid CORS, direct CDN on server
    const url = isBrowser ? '/api/news' : NEWS_CDN_URL;
    const res = await fetch(url, isBrowser ? {} : {
      next: { revalidate: 300 }, // Revalidate every 5 minutes (server only)
    });

    if (!res.ok) {
      console.error('Failed to fetch news:', res.status);
      return [];
    }

    const data: NewsResponse = await res.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching news:', error);
    return [];
  }
}
