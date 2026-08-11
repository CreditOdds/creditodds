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
 *
 * `community` is a THIRD tier and is kept separate from `usage` on purpose.
 * It is what people report on Reddit: useful, specific, and frequently wrong or
 * out of date within days. Every entry carries the date it was reported and a
 * link, and the UI labels it as community-reported rather than presenting it as
 * fact. Dunkin is the cautionary example: the 24 hour reload throttle that was
 * the defining trick of this promo was reported lifted on 2026-08-08, three
 * days after we first wrote it up as settled behaviour.
 *
 * When these conflict, say so in the note rather than picking a winner.
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

/** A community report: specific, dated, linked, and explicitly not verified. */
export interface CommunityNote {
  note: string;
  /** Date of the reports this summarises, so staleness is visible. */
  asOf: string;
  /** Permalink to a representative thread. */
  source: string;
}

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
  /** Reported by users, not verified by us. Rendered with that caveat attached. */
  community?: CommunityNote;
}

/** Captured from paze.com/merchant-directory on 2026-08-10. */
export const PAZE_DIRECTORY_CAPTURED = '2026-08-10';

/**
 * The promotion driving essentially all current Paze interest. Nearly every
 * community note below only makes sense in its context, and most of them stop
 * being relevant the day it ends, so the page states the end date up front
 * rather than letting the notes quietly rot.
 *
 * Wording and end date are Paze's own, from the directory page creative.
 */
export const PAZE_PROMO = {
  text: 'Spend $10 or more, get $10 back up to 10 times, as a statement credit. Terms apply.',
  endsOn: '2026-09-10',
} as const;

export const PAZE_MERCHANTS: PazeMerchant[] = [
  {
    slug: 'dunkin',
    name: 'Dunkin',
    url: 'https://dunkin.app.link/dunkinxpaze_2026',
    category: 'Food & Grocery',
    usage:
      'Gift card reload in the Dunkin app was the main play: $10 per reload, historically throttled to one every 24 hours, where retrying early restarted the window rather than failing cleanly. Treat the throttle as unstable rather than fixed, see the community note.',
    offer: 'Check out in the Dunkin app with Paze and get up to $100 in statement credits.',
    community: {
      note: 'The 24 hour throttle (which surfaced as an APP4241 error, and was reported as anywhere from 24 to 48 hours) was widely reported lifted on 2026-08-08, with several users running consecutive reloads in one sitting. Other posts the same week report it still in force, and one report of the lift was edited to say it had stopped working again, so this appears to change without notice. Separately, Dunkin is reported to cap a gift card at $150 and the app wallet at roughly $250.',
      asOf: '2026-08-08',
      source: 'https://www.reddit.com/r/DDoffers/comments/1vj3yad/no_more_24_hour_delaythrottling_with_dunkin_gift/',
    },
  },
  {
    slug: 'dominos',
    name: "Domino's",
    url: 'https://www.dominos.com/en/restaurants?utm_campaign=Paze&utm_source=PazeLandingPage&utm_medium=other',
    category: 'Food & Grocery',
    offer: "Check out in the Domino's app with Paze and get up to $100 in statement credits.",
    community: {
      note: "Popular because a $10 pizza deal lands almost exactly on the $10 threshold. Users report the promo confirmation appearing at checkout before you pay, and treat its absence as a sign the order will not qualify. Domino's also carries a $10 St Jude donation that people use to burn a credit they cannot otherwise spend.",
      asOf: '2026-08-08',
      source: 'https://www.reddit.com/r/ChaseSapphire/comments/1vil8jz/paze_offer_donate_10_to_st_jude_childrens/',
    },
  },
  {
    slug: 'newegg',
    name: 'Newegg',
    url: 'https://www.newegg.com/paze',
    category: 'Electronics',
    community: {
      note: "Newegg's own Paze page states gift cards must be $50 or more to pay with Paze. The wider gift card angle is reported closed: Newegg pulled Paze as a payment option for third-party gift cards earlier in the promo, which users refer to as the Newegg nerf. Reports conflict on exactly what still qualifies, so check Newegg's page before planning around it.",
      asOf: '2026-08-10',
      source: 'https://www.reddit.com/r/CreditCards/comments/1vkb4se/so_paze_still_works_on_newegg_gift_cards/',
    },
  },
  {
    slug: 'little-caesars',
    name: 'Little Caesars',
    url: 'https://littlecaesars.com/en-us/',
    category: 'Food & Grocery',
    community: {
      note: 'Another near-exact $10 order, so it is used the same way as Domino\'s. Several users report Little Caesars statement credits taking longer to post than other merchants, in some cases past the two billing cycles the terms mention.',
      asOf: '2026-07-28',
      source: 'https://www.reddit.com/r/CreditCards/comments/1v9atpa/paze_not_creditingis_that_a_common_issue_for/',
    },
  },
  { slug: 'whataburger', name: 'Whataburger', url: 'https://whataburger.com/home', category: 'Food & Grocery' },
  { slug: 'shoprite', name: 'ShopRite', url: 'https://www.shoprite.com/', category: 'Food & Grocery' },
  {
    slug: 'gnc',
    name: 'GNC',
    url: 'https://www.gnc.com/',
    category: 'Beauty & Health',
    community: {
      note: 'Two recurring complaints: Paze disappearing as a checkout option, and qualifying GNC purchases not generating the statement credit when every other merchant on the same card did. One user reports purchases from 10 July still uncredited a month later, with the items non-returnable.',
      asOf: '2026-08-09',
      source: 'https://www.reddit.com/r/CreditCards/comments/1vjblw5/what_are_some_good_1030_purchases_that_can_be/',
    },
  },
  {
    slug: 'sephora',
    name: 'Sephora',
    url: 'https://www.sephora.com/',
    category: 'Beauty & Health',
    community: {
      note: 'The main non-food option, and the one with a confirmed problem: responding to a CFPB complaint, Paze acknowledged a technical issue delaying statement credits on some eligible Sephora purchases and said it is working to apply them. Paze has also been reported missing from Sephora checkout at times. Credits do land for most people, with reports of roughly four days rather than the one to two statement cycles the terms allow.',
      asOf: '2026-08-10',
      source: 'https://www.reddit.com/r/ChaseSapphire/comments/1vktslk/sephora_cfpb_update/',
    },
  },
  { slug: 'pet-supermarket', name: 'Pet Supermarket', url: 'https://www.petsupermarket.com/', category: 'Food & Grocery' },
  { slug: 'roku', name: 'Roku', url: 'https://www.roku.com/', category: 'Electronics' },
  { slug: 'xsolla', name: 'Xsolla', url: 'https://xsolla.com/', category: 'Electronics' },
  { slug: 'payrange', name: 'PayRange', url: 'https://payrange.com/', category: 'Services' },
  { slug: 'usa-today', name: 'USA Today', url: 'https://www.usatoday.com/', category: 'Services' },
  {
    slug: '1-800-flowers',
    name: '1-800-Flowers',
    url: 'https://www.1800flowers.com/',
    category: 'Flowers & Gifts',
    community: {
      note: 'Carries a $10 donation to Smile Farms, which users pass around as a way to use a credit they have no other use for. Otherwise treated as a straightforward $10 order.',
      asOf: '2026-08-08',
      source: 'https://www.reddit.com/r/CreditCards/comments/1vil81n/paze_offer_donate_10_to_st_jude_childrens/',
    },
  },
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
  {
    slug: 'stubhub',
    name: 'StubHub',
    url: 'https://www.stubhub.com/',
    category: 'Travel & Entertainment',
    community: {
      note: 'Paze shows up at checkout on the web and mobile browser, but users report it missing in the StubHub app, and that the app and desktop show different ticket inventory. If the listing you want will not offer Paze, check the other surface before giving up. Stacks with a card StubHub credit for people who carry one.',
      asOf: '2026-08-07',
      source: 'https://www.reddit.com/r/ChaseSapphire/comments/1vi6o0e/stubhub_different_inventory_online_and_inapp/',
    },
  },
  {
    slug: 'united-airlines',
    name: 'United Airlines',
    url: 'https://www.united.com/en/us',
    category: 'Travel & Entertainment',
    community: {
      note: 'Works on united.com, but one user reports the resulting charge posting with a method of "In person" rather than the online/Paze method their other Paze purchases showed. Unresolved whether that affects the credit, so do not assume a large fare qualifies just because small orders elsewhere did.',
      asOf: '2026-08-07',
      source: 'https://www.reddit.com/r/CreditCards/comments/1viciao/united_purchase_with_chase_freedom_unlimited_via/',
    },
  },
];
