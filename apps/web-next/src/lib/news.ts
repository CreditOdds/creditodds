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
  source?: string;
  source_url?: string;
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
  'new-card': 'bg-green-100 text-green-800',
  'discontinued': 'bg-red-100 text-red-800',
  'bonus-change': 'bg-blue-100 text-blue-800',
  'fee-change': 'bg-yellow-100 text-yellow-800',
  'benefit-change': 'bg-purple-100 text-purple-800',
  'limited-time': 'bg-orange-100 text-orange-800',
  'policy-change': 'bg-gray-100 text-gray-800',
  'general': 'bg-indigo-100 text-indigo-800',
};

const NEWS_CDN_URL = 'https://d2hxvzw7msbtvt.cloudfront.net/news.json';

// Check if running in the browser
const isBrowser = typeof window !== 'undefined';

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
