// Best pages API types and fetching
import { getContentCollection } from './contentCollection';

export interface BestConsensus {
  score?: number;
  ranks?: Record<string, number>;
}

export interface BestPanelModel {
  key: string;
  label: string;
  model?: string;
}

export interface BestPanel {
  method?: string;
  generated_at?: string;
  models: BestPanelModel[];
}

export interface BestPageCard {
  slug: string;
  highlight?: string;
  badge?: string;
  previous_rank?: number;
  consensus?: BestConsensus;
}

export interface BestPage {
  id: string;
  slug: string;
  title: string;
  description: string;
  date: string;
  updated_at?: string;
  author?: string;
  author_slug?: string;
  seo_title?: string;
  seo_description?: string;
  intro?: string;
  panel?: BestPanel;
  cards: BestPageCard[];
}

export interface BestPagesResponse {
  generated_at: string;
  count: number;
  pages: BestPage[];
}

export async function getBestPages(signal?: AbortSignal): Promise<BestPage[]> {
  return getContentCollection<BestPage>('best', 'pages', 'slug', signal);
}

export async function getBestPage(slug: string): Promise<BestPage | null> {
  const pages = await getBestPages();
  return pages.find(page => page.slug === slug) || null;
}
