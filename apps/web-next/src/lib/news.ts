// News API types and fetching
import { fetchWithRetry } from './fetchWithRetry';
import type { ReplacementCardInfo } from './api';

export type NewsTag =
  | 'new-card'
  | 'discontinued'
  | 'bonus-change'
  | 'fee-change'
  | 'benefit-change'
  | 'limited-time'
  | 'policy-change'
  | 'rumor'
  | 'general';

// Shared with the card-page surface, so the definition lives next to `Card`.
// Re-exported here because news consumers have imported it from this module
// since the rail shipped (#1924).
export type { ReplacementCardInfo };

/**
 * A card a news item is about, resolved at build time by scripts/build-news.js.
 * Self-contained on purpose: the image travels with its own slug and name, so a
 * card missing from cards.json blanks only itself instead of shifting every
 * later image onto the wrong card.
 */
export interface NewsCardInfo {
  slug: string;
  name: string;
  image: string | null;
}

export interface NewsItem {
  id: string;
  date: string;
  /** Date of the last substantive update (YYYY-MM-DD); sorting still uses date. */
  updated?: string;
  title: string;
  summary: string;
  tags: NewsTag[];
  bank?: string;
  card_slug?: string;
  card_name?: string;
  card_image_link?: string;
  card_slugs?: string[];
  card_names?: string[];
  /**
   * Resolved images only — NOT index-aligned with card_slugs/card_names, since
   * unresolved cards are dropped. Legacy; read `cards_info` via getNewsCards().
   */
  card_image_links?: string[];
  cards_info?: NewsCardInfo[];
  replacement_cards_info?: ReplacementCardInfo[];
  source?: string;
  source_url?: string;
  body?: string;
  /** AI-generated hero image filename under news_images/ on the assets CDN. */
  news_image?: string;
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
  'rumor': '📡 Rumor',
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
  'rumor': 'bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-600/20',
  'general': 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20',
};

/**
 * The cards a news item is about, as self-contained objects.
 *
 * Always use this instead of indexing card_slugs / card_names /
 * card_image_links against each other. Falls back to those legacy arrays for a
 * news.json published before build-news.js emitted cards_info — and only trusts
 * the images there when the array lengths line up, because the old builder
 * dropped unresolved entries and a short array means everything after the gap
 * is shifted onto the wrong card.
 */
export function getNewsCards(item: NewsItem | null | undefined): NewsCardInfo[] {
  if (!item) return [];
  if (item.cards_info?.length) return item.cards_info;

  const slugs = item.card_slugs?.length
    ? item.card_slugs
    : item.card_slug
      ? [item.card_slug]
      : [];
  if (slugs.length === 0) return [];

  const names = item.card_names?.length
    ? item.card_names
    : item.card_name
      ? [item.card_name]
      : [];
  const images = item.card_image_links?.length
    ? item.card_image_links
    : item.card_image_link
      ? [item.card_image_link]
      : [];
  const aligned = images.length === slugs.length;

  return slugs.map((slug, i) => ({
    slug,
    name: names[i] || slug,
    image: aligned ? images[i] ?? null : null,
  }));
}

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
    const res = await fetchWithRetry(url, isBrowser ? {} : {
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
