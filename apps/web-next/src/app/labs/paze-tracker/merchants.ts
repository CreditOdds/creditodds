/**
 * Merchants that accept Paze.
 *
 * TWO KINDS OF DATA LIVE HERE, and the difference matters:
 *
 *   1. `name`, `url`, `category` are transcribed from Paze's own merchant
 *      directory (https://www.paze.com/merchant-directory), captured
 *      2026-08-10. Paze paginates that page behind a "Load More" button; the
 *      full list at capture time was 33 merchants.
 *
 *   2. `usage` is OURS. It is the field knowledge that makes this page worth
 *      visiting: what you can actually do with Paze at that merchant, caps,
 *      reload rules, gotchas. Paze does not publish any of it.
 *
 * Rule for `usage`: only write what someone has actually confirmed. An empty
 * `usage` renders as "No notes yet" and that is the honest state for most of
 * this list today. Do not infer a merchant's behaviour from another merchant's.
 *
 * `offer` is a Paze-run promotion quoted from Paze's own creative. Quote it,
 * do not paraphrase it into a stronger claim, and drop it once it expires.
 */

export type PazeCategory =
  | 'Apparel & Shoes'
  | 'Beauty & Health'
  | 'Electronics'
  | 'Flowers & Gifts'
  | 'Food & Grocery'
  | 'Services'
  | 'Travel & Entertainment';

/** Paze's own filter taxonomy, in the order the directory lists it. */
export const PAZE_CATEGORIES: PazeCategory[] = [
  'Apparel & Shoes',
  'Beauty & Health',
  'Electronics',
  'Flowers & Gifts',
  'Food & Grocery',
  'Services',
  'Travel & Entertainment',
];

export interface PazeMerchant {
  slug: string;
  name: string;
  /** Where Paze's directory sends you. Some carry Paze campaign parameters. */
  url: string;
  category: PazeCategory;
  /** Our field notes. Empty until someone confirms how it actually works. */
  usage?: string;
  /** A live Paze promotion, quoted from Paze's own wording. */
  offer?: string;
}

/** Captured from paze.com/merchant-directory on 2026-08-10. */
export const PAZE_DIRECTORY_CAPTURED = '2026-08-10';

export const PAZE_MERCHANTS: PazeMerchant[] = [
  {
    slug: 'dunkin',
    name: 'Dunkin',
    url: 'https://dunkin.app.link/dunkinxpaze_2026',
    category: 'Food & Grocery',
    usage:
      'Gift card reload in the Dunkin app: $10 per reload, once every 24 hours. The clock is strict. Attempting another reload before the 24 hours is up restarts the 24 hour window rather than failing quietly, so a mistimed attempt costs you the next one too.',
    offer: 'Check out in the Dunkin app with Paze and get up to $100 in statement credits.',
  },
  {
    slug: 'dominos',
    name: "Domino's",
    url: 'https://www.dominos.com/en/restaurants?utm_campaign=Paze&utm_source=PazeLandingPage&utm_medium=other',
    category: 'Food & Grocery',
    offer: "Check out in the Domino's app with Paze and get up to $100 in statement credits.",
  },
  {
    slug: 'newegg',
    name: 'Newegg',
    url: 'https://www.newegg.com/paze',
    category: 'Electronics',
  },
  { slug: 'little-caesars', name: 'Little Caesars', url: 'https://littlecaesars.com/en-us/', category: 'Food & Grocery' },
  { slug: 'whataburger', name: 'Whataburger', url: 'https://whataburger.com/home', category: 'Food & Grocery' },
  { slug: 'shoprite', name: 'ShopRite', url: 'https://www.shoprite.com/', category: 'Food & Grocery' },
  { slug: 'gnc', name: 'GNC', url: 'https://www.gnc.com/', category: 'Beauty & Health' },
  { slug: 'sephora', name: 'Sephora', url: 'https://www.sephora.com/', category: 'Beauty & Health' },
  { slug: 'pet-supermarket', name: 'Pet Supermarket', url: 'https://www.petsupermarket.com/', category: 'Food & Grocery' },
  { slug: 'roku', name: 'Roku', url: 'https://www.roku.com/', category: 'Electronics' },
  { slug: 'xsolla', name: 'Xsolla', url: 'https://xsolla.com/', category: 'Electronics' },
  { slug: 'payrange', name: 'PayRange', url: 'https://payrange.com/', category: 'Services' },
  { slug: 'usa-today', name: 'USA Today', url: 'https://www.usatoday.com/', category: 'Services' },
  { slug: '1-800-flowers', name: '1-800-Flowers', url: 'https://www.1800flowers.com/', category: 'Flowers & Gifts' },
  { slug: 'ftd', name: 'FTD', url: 'https://www.ftd.com/', category: 'Flowers & Gifts' },
  { slug: 'proflowers', name: 'Proflowers', url: 'https://www.proflowers.com/', category: 'Flowers & Gifts' },
  { slug: 'teleflora', name: 'Teleflora', url: 'https://www.teleflora.com/', category: 'Flowers & Gifts' },
  { slug: 'harry-and-david', name: 'Harry & David', url: 'https://www.harryanddavid.com/', category: 'Flowers & Gifts' },
  { slug: 'personalization-mall', name: 'Personalization Mall', url: 'https://www.personalizationmall.com/', category: 'Flowers & Gifts' },
  { slug: 'banter-by-piercing-pagoda', name: 'Banter by Piercing Pagoda', url: 'https://www.banter.com/', category: 'Apparel & Shoes' },
  { slug: 'jared', name: 'Jared', url: 'https://www.jared.com/', category: 'Apparel & Shoes' },
  { slug: 'kay-jewelers', name: 'KAY Jewelers', url: 'https://www.kay.com/', category: 'Apparel & Shoes' },
  { slug: 'zales', name: 'Zales', url: 'https://www.zales.com/', category: 'Apparel & Shoes' },
  { slug: 'lids', name: 'Lids', url: 'https://www.lids.com/', category: 'Apparel & Shoes' },
  { slug: 'fanatics', name: 'Fanatics', url: 'https://www.fanatics.com/pazepromo', category: 'Apparel & Shoes' },
  { slug: 'durango', name: 'Durango', url: 'https://www.durangoboots.com/', category: 'Apparel & Shoes' },
  { slug: 'georgia-boot', name: 'Georgia Boot', url: 'https://www.georgiaboot.com/', category: 'Apparel & Shoes' },
  { slug: 'muck-boot-company', name: 'Muck Boot Company', url: 'https://www.muckbootcompany.com/', category: 'Apparel & Shoes' },
  { slug: 'xtratuf', name: 'XTRATUF', url: 'https://www.xtratuf.com/', category: 'Apparel & Shoes' },
  { slug: 'broadway-com', name: 'Broadway.com', url: 'https://www.broadway.com/', category: 'Travel & Entertainment' },
  { slug: 'city-experiences', name: 'City Experiences', url: 'https://www.cityexperiences.com/', category: 'Travel & Entertainment' },
  { slug: 'stubhub', name: 'StubHub', url: 'https://www.stubhub.com/', category: 'Travel & Entertainment' },
  { slug: 'united-airlines', name: 'United Airlines', url: 'https://www.united.com/en/us', category: 'Travel & Entertainment' },
];
