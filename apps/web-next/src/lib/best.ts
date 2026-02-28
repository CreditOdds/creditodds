// Best pages API types and fetching

export interface BestPageCard {
  slug: string;
  highlight?: string;
  badge?: string;
}

export interface BestPage {
  id: string;
  slug: string;
  title: string;
  description: string;
  date: string;
  updated_at?: string;
  author: string;
  author_slug?: string;
  seo_title?: string;
  seo_description?: string;
  intro?: string;
  cards: BestPageCard[];
}

export interface BestPagesResponse {
  generated_at: string;
  count: number;
  pages: BestPage[];
}

const BEST_CDN_URL = 'https://d2hxvzw7msbtvt.cloudfront.net/best.json';

// Check if running in the browser
const isBrowser = typeof window !== 'undefined';

export async function getBestPages(): Promise<BestPage[]> {
  try {
    // In development on the server, read from local file
    if (!isBrowser && process.env.NODE_ENV === 'development') {
      const fs = await import('fs/promises');
      const path = await import('path');
      const filePath = path.join(process.cwd(), '..', '..', 'data', 'best.json');
      const fileContent = await fs.readFile(filePath, 'utf8');
      const data: BestPagesResponse = JSON.parse(fileContent);
      return data.pages || [];
    }

    // Use local API route on client to avoid CORS, direct CDN on server
    const url = isBrowser ? '/api/best' : BEST_CDN_URL;
    const res = await fetch(url, isBrowser ? {} : {
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      console.error('Failed to fetch best pages:', res.status);
      return [];
    }

    const data: BestPagesResponse = await res.json();
    return data.pages || [];
  } catch (error) {
    console.error('Error fetching best pages:', error);
    return [];
  }
}

export async function getBestPage(slug: string): Promise<BestPage | null> {
  const pages = await getBestPages();
  return pages.find(page => page.slug === slug) || null;
}
