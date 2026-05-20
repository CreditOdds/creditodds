import 'server-only';
import storesData from '../../../../data/stores.json';

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

// stores.json is imported statically so its contents are bundled straight
// into the build output. The long-tail /best-card-for/[slug] pages render
// on demand on Amplify's SSR runtime, which only ships files traced from
// apps/web-next — a process.cwd()-relative fs.readFile of the repo-root
// data/ dir there throws ENOENT and 500s the page. A static import
// sidesteps file tracing entirely: the data lives in the JS bundle.
const data = storesData as unknown as StoresFile;
const stores: Store[] = data.stores || [];
const generatedAt: string = data.generated_at ?? '';

export async function getAllStores(): Promise<Store[]> {
  return stores;
}

export async function getStoresGeneratedAt(): Promise<string> {
  return generatedAt;
}

export async function getStore(slug: string): Promise<Store | null> {
  return stores.find(s => s.slug === slug) || null;
}
