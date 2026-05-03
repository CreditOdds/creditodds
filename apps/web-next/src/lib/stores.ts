import 'server-only';
import fs from 'fs/promises';
import path from 'path';

export interface StoreAlsoEarns {
  card: string;
  rate: number;
  unit: 'percent' | 'points_per_dollar';
  note?: string;
}

export interface StoreFaq {
  q: string;
  a: string;
}

export interface Store {
  name: string;
  slug: string;
  aliases?: string[];
  categories: string[];
  website?: string;
  logo?: string;
  parent_company?: string;
  co_brand_cards?: string[];
  also_earns?: StoreAlsoEarns[];
  intro: string;
  faq?: StoreFaq[];
}

interface StoresFile {
  generated_at: string;
  count: number;
  stores: Store[];
}

let cached: Store[] | null = null;

async function loadStores(): Promise<Store[]> {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), '..', '..', 'data', 'stores.json');
  const fileContent = await fs.readFile(filePath, 'utf8');
  const data: StoresFile = JSON.parse(fileContent);
  cached = data.stores || [];
  return cached;
}

export async function getAllStores(): Promise<Store[]> {
  return loadStores();
}

export async function getStore(slug: string): Promise<Store | null> {
  const stores = await loadStores();
  return stores.find(s => s.slug === slug) || null;
}
