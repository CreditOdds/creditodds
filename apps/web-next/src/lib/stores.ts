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

/** Merged in at build time from data/affiliates.yaml, keyed by store slug. */
export interface StoreAffiliate {
  /** Absent on a code-only entry; every entry has a `url`, a `code`, or both. */
  url?: string;
  /**
   * A referral code the customer types in at sign-up, for programs that issue
   * a code and no link. With no `url` the CTA shows the code and a copy
   * button instead of an outbound button. With a `url` too, the code shows
   * under the title next to the outbound button.
   */
  code?: string;
  /** Overrides the panel title ("Shopping at {name}?"). */
  headline?: string;
  /**
   * Replaces the "Enter this code at sign-up..." sentence next to a `code`,
   * for programs where the code goes somewhere specific (Temu: in the app).
   * The referral-credit disclosure is always appended after it.
   */
  code_note?: string;
  network: string;
  /**
   * The merchant's standing offer, phrased to read between "See " and
   * " at {name}" — e.g. "10 free meals". Belongs to the merchant, never to
   * CreditOdds. Evergreen only; see data/affiliates.yaml.
   */
  offer?: string;
  /** Overrides the button label entirely. Beats `offer`. */
  cta?: string;
  /**
   * Network-hosted banner creative. Optional: only a minority of merchants
   * have an evergreen, standard-size banner, so the text CTA remains the
   * fallback and the default. Dimensions are required so the slot can be
   * reserved and the image cannot shift the page while it loads.
   */
  banner?: {
    image: string;
    width: number;
    height: number;
  };
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
  affiliate?: StoreAffiliate;
}

interface StoresFile {
  generated_at: string;
  count: number;
  stores: Store[];
}

// Build-time directory data is shared by HTML, sitemaps, and social images.
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
