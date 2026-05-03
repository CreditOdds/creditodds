#!/usr/bin/env node
// One-shot generator for the initial batch of /best-card-for/[slug] pages.
//
// We hold the merchant data inline as JS rather than 49 individual hand-written
// YAML files because:
//   1) it keeps the source of truth reviewable in one place during the
//      seed, with consistent shape/length checks;
//   2) it lets us re-run after schema/category tweaks without diffing
//      49 separate files;
//   3) build:stores runs after this and is the actual gatekeeper —
//      validation is unchanged.
//
// After this seed lands, individual store edits should happen in the
// generated YAML files (or via PR), NOT by editing this script.

const fs = require('fs');
const path = require('path');

const STORES_DIR = path.join(__dirname, '..', 'data', 'stores');

const stores = [
  // ===== Wholesale & big-box =====
  {
    slug: 'costco',
    name: 'Costco',
    aliases: ['Costco Wholesale'],
    categories: ['wholesale_clubs'],
    website: 'https://www.costco.com',
    intro:
      "Costco Wholesale runs about 600 warehouses worldwide and a sizable online catalog at costco.com. " +
      "The pricing model revolves around member-only bulk buying, so card choice matters most for people " +
      "running weekly grocery and gas trips through the warehouse. Two quirks worth knowing: Costco " +
      "accepts only Visa cards in-warehouse (no Mastercard, Amex, or Discover), and Costco gas pumps " +
      "code as wholesale clubs — not gas — so a 5% gas card will not trigger at the pump here.",
  },
  {
    slug: 'sams-club',
    name: "Sam's Club",
    aliases: ['Sams Club'],
    categories: ['wholesale_clubs'],
    website: 'https://www.samsclub.com',
    parent_company: 'Walmart, Inc.',
    intro:
      "Sam's Club is Walmart's warehouse-club arm, with about 600 U.S. clubs and a steadily growing " +
      "online and Scan & Go catalog. Member tiers (Club vs. Plus) affect free-shipping and curbside " +
      "perks but not the rewards math at the register. Sam's accepts Visa, Mastercard, Amex, and " +
      "Discover, and Sam's Club gas pumps code as wholesale clubs rather than gas stations — the " +
      "same rule as Costco.",
  },
  {
    slug: 'bjs-wholesale',
    name: "BJ's Wholesale Club",
    aliases: ["BJ's", 'BJs Wholesale'],
    categories: ['wholesale_clubs'],
    website: 'https://www.bjs.com',
    intro:
      "BJ's Wholesale Club is the East Coast-focused warehouse retailer with about 240 clubs and a " +
      "growing online catalog. Unlike Costco and Sam's Club, BJ's accepts manufacturer coupons in " +
      "addition to its own discounts, which can stack on top of card rewards. BJ's accepts all four " +
      "card networks, and BJ's gas pumps code as wholesale clubs — not as gas — so a flat 5% gas card " +
      "will not earn at the pump here.",
  },
  {
    slug: 'walmart',
    name: 'Walmart',
    aliases: ['Walmart Inc'],
    categories: ['online_shopping'],
    website: 'https://www.walmart.com',
    intro:
      "Walmart is the country's largest grocer and one of its largest general retailers, but it sits in " +
      "an awkward spot for credit-card rewards. Most cards' grocery 3-5% bonuses explicitly exclude " +
      "Walmart (it codes as a discount store, not a supermarket), and Walmart's gas stations code as " +
      "Walmart, not gas. Walmart.com purchases code as online shopping on most cards, which opens up " +
      "the strongest non-co-branded earn rates — in-store purchases generally fall back to flat-rate " +
      "cashback unless you're using a Walmart-issued card.",
  },
  {
    slug: 'target',
    name: 'Target',
    aliases: ['Target Corp'],
    categories: ['online_shopping'],
    website: 'https://www.target.com',
    intro:
      "Target sits in the same awkward bucket as Walmart for general-purpose credit cards: it codes as " +
      "a discount store rather than a supermarket or department store, so most cards' bonus categories " +
      "(grocery, dining, department stores) miss it entirely. Target.com purchases code as online " +
      "shopping on most cards, which is where the highest non-co-branded earn rates show up. In-store, " +
      "you're typically falling back to a strong flat-rate card unless you carry a Target-issued card " +
      "for the 5% RedCard discount applied at checkout.",
  },

  // ===== Online retail =====
  {
    slug: 'amazon',
    name: 'Amazon',
    aliases: ['Amazon.com'],
    categories: ['amazon', 'online_shopping'],
    website: 'https://www.amazon.com',
    intro:
      "Amazon.com is the dominant U.S. online retailer and a category unto itself in many credit-card " +
      "rewards programs. Several cards explicitly bonus on Amazon purchases (often quarterly, often " +
      "tied to Prime membership), and Amazon.com always codes as online shopping for cards with that " +
      "as a generic bonus category. The rule of thumb: an Amazon-specific bonus almost always beats a " +
      "generic online-shopping bonus, but caps and Prime requirements can flip the math for heavy " +
      "shoppers.",
  },
  {
    slug: 'ebay',
    name: 'eBay',
    aliases: ['Ebay'],
    categories: ['online_shopping'],
    website: 'https://www.ebay.com',
    intro:
      "eBay is the largest U.S. online auction and resale marketplace and codes as online shopping on " +
      "essentially every credit card we track. Unlike Amazon, eBay rarely has a card-specific bonus " +
      "carve-out, so the right card here is the strongest generic online-shopping earner you carry. " +
      "Watch for cards with a U.S. online retail cap — eBay payments via PayPal still count as eBay " +
      "for category coding, but third-party processor purchases on eBay's classifieds side may not.",
  },
  {
    slug: 'etsy',
    name: 'Etsy',
    aliases: [],
    categories: ['online_shopping'],
    website: 'https://www.etsy.com',
    intro:
      "Etsy is the marketplace for handmade, vintage, and craft goods sold by independent makers, with " +
      "checkout handled by Etsy itself. Purchases code as online shopping on every general-purpose " +
      "card we track, which means Etsy is a good fit for any card with a flat U.S. online retail bonus " +
      "(Blue Cash Everyday, Hilton Surpass, etc.). Etsy doesn't have a co-branded card and rarely " +
      "shows up in card-specific bonus lists.",
  },
  {
    slug: 'best-buy',
    name: 'Best Buy',
    aliases: ['BestBuy'],
    categories: ['online_shopping'],
    website: 'https://www.bestbuy.com',
    intro:
      "Best Buy is the largest U.S. specialty electronics retailer, with about 950 stores and a strong " +
      "bestbuy.com presence. In-store and online purchases generally code as electronics or online " +
      "shopping rather than as a department store, so the answer here usually comes down to a flat " +
      "online-retail card or a flat-rate card. The My Best Buy Visa offers in-house financing and " +
      "5-6% back at Best Buy specifically, but the math only works for shoppers spending several " +
      "thousand dollars a year on electronics.",
  },
  {
    slug: 'apple',
    name: 'Apple',
    aliases: ['Apple Store', 'apple.com'],
    categories: ['online_shopping'],
    website: 'https://www.apple.com',
    intro:
      "Apple's own retail channels — apple.com, the Apple Store app, and ~270 physical Apple Stores — " +
      "code as online shopping for most cards on the .com side and as electronics in-store. Apple " +
      "purchases through Apple Pay also enable several merchant-specific bonuses on cards that bonus " +
      "Apple Pay, but those typically require the purchase to be made via the Apple Pay button rather " +
      "than chip-and-PIN. The Apple Card itself earns 3% on Apple-branded purchases, which is the " +
      "strongest non-promotional rate you'll find here.",
  },

  // ===== Department stores =====
  {
    slug: 'macys',
    name: "Macy's",
    aliases: ['Macys'],
    categories: ['department_stores', 'online_shopping'],
    website: 'https://www.macys.com',
    intro:
      "Macy's is the largest U.S. mid-tier department store, with about 500 full-line stores plus " +
      "Backstage outlets and a heavy promotional calendar. Most shoppers buy at heavy discount, so " +
      "the cashback rate stacks on already-reduced prices. Macy's codes as a department store at the " +
      "register and as online shopping on macys.com, which means cards bonusing on either category " +
      "can earn here. The Macy's American Express has its own Loyallist points layer for shoppers " +
      "doing several thousand a year at Macy's specifically.",
  },
  {
    slug: 'nordstrom',
    name: 'Nordstrom',
    aliases: ['Nordstrom Rack'],
    categories: ['department_stores', 'online_shopping'],
    website: 'https://www.nordstrom.com',
    intro:
      "Nordstrom is a higher-end department store with about 100 full-line stores and a much larger " +
      "Nordstrom Rack outlet network. Pricing skews full-retail at the flagship locations and steeply " +
      "discounted at Rack, so the right card depends partly on which channel you're shopping. " +
      "Both code as department stores at the register and online shopping on nordstrom.com / " +
      "nordstromrack.com. Nordstrom's own Nordy Club rewards layer in on top of card cashback.",
  },
  {
    slug: 'kohls',
    name: "Kohl's",
    aliases: ['Kohls'],
    categories: ['department_stores', 'online_shopping'],
    website: 'https://www.kohls.com',
    intro:
      "Kohl's is a mid-tier department store with about 1,150 stores and an aggressive Kohl's Cash " +
      "rewards program. Most regular shoppers stack manufacturer sales, Kohl's coupons, and Kohl's " +
      "Cash, so card cashback is the smallest of several layers. The Kohl's Card (issued by Capital " +
      "One) gives in-house discounts but no MasterCard/Visa-network rewards. For most shoppers, a " +
      "department-store-bonus general-purpose card is the right answer.",
  },
  {
    slug: 'jcpenney',
    name: 'JCPenney',
    aliases: ['JC Penney', 'Penneys'],
    categories: ['department_stores', 'online_shopping'],
    website: 'https://www.jcpenney.com',
    intro:
      "JCPenney is a mid-tier department store with about 660 stores and a smaller online catalog at " +
      "jcpenney.com. Like other mid-tier department chains, the bulk of purchases happen at promotional " +
      "discount, so card rewards stack on already-reduced prices. JCPenney codes as a department " +
      "store in-store and online shopping on the website, so cards bonusing on either category will " +
      "trigger here.",
  },
  {
    slug: 'saks-fifth-avenue',
    name: 'Saks Fifth Avenue',
    aliases: ['Saks'],
    categories: ['department_stores', 'online_shopping'],
    website: 'https://www.saksfifthavenue.com',
    intro:
      "Saks Fifth Avenue is a high-end department store with about 40 full-line stores plus the much " +
      "larger Saks Off 5th outlet network. Average ticket sizes are higher than at mass-market " +
      "department chains, which makes a high-rate department-store category card more valuable here " +
      "than at, say, JCPenney. Saks codes as a department store in-store and online shopping on " +
      "saksfifthavenue.com, so general-purpose category bonuses apply.",
  },
  {
    slug: 'neiman-marcus',
    name: 'Neiman Marcus',
    aliases: ['Neimans'],
    categories: ['department_stores', 'online_shopping'],
    website: 'https://www.neimanmarcus.com',
    intro:
      "Neiman Marcus is a luxury department store with about 35 full-line stores and a significant " +
      "online presence. Average tickets here are among the highest in U.S. department retail, which " +
      "shifts the math toward cards that pay a high department-store category rate without a tight " +
      "spend cap. NM's own InCircle loyalty program runs alongside any card cashback you earn at " +
      "checkout.",
  },

  // ===== Home improvement =====
  {
    slug: 'home-depot',
    name: 'Home Depot',
    aliases: ['The Home Depot', 'HD'],
    categories: ['home_improvement'],
    website: 'https://www.homedepot.com',
    intro:
      "The Home Depot is the largest U.S. home-improvement retailer, with about 2,000 stores and a " +
      "heavily-used Pro Xtra business loyalty program. The right card here depends a lot on whether " +
      "you're a homeowner doing one project a year or a contractor running steady volume — the gap " +
      "between the best home-improvement category card and a generic 2% card is meaningful at " +
      "contractor spend levels. Home Depot codes as home improvement at the register and on " +
      "homedepot.com.",
  },
  {
    slug: 'lowes',
    name: "Lowe's",
    aliases: ['Lowes'],
    categories: ['home_improvement'],
    website: 'https://www.lowes.com',
    intro:
      "Lowe's is the second-largest U.S. home-improvement retailer at about 1,750 stores, with a " +
      "long-standing rivalry with Home Depot for both consumer and pro spend. Pricing is similar " +
      "between the two, so the right card here is whichever home-improvement-bonus general-purpose " +
      "card you carry, plus the Lowe's Advantage credit line if you're financing a large project. " +
      "Lowe's codes as home improvement in-store and on lowes.com.",
  },
  {
    slug: 'menards',
    name: 'Menards',
    aliases: [],
    categories: ['home_improvement'],
    website: 'https://www.menards.com',
    intro:
      "Menards is a Midwest-focused home-improvement chain with about 350 stores, well-known for its " +
      "11% mail-in rebate promotions that effectively act as in-house cashback on top of card rewards. " +
      "The math here is interesting: an 11% Menards rebate stacked with a 2% flat-rate cashback card " +
      "often beats most home-improvement category cards on net. Menards codes as home improvement at " +
      "the register and on menards.com.",
  },
  {
    slug: 'ace-hardware',
    name: 'Ace Hardware',
    aliases: ['Ace'],
    categories: ['home_improvement'],
    website: 'https://www.acehardware.com',
    intro:
      "Ace Hardware is a cooperative of about 5,000 independently-owned hardware stores in the U.S., " +
      "smaller and more service-oriented than Home Depot or Lowe's. Ace's own Ace Rewards loyalty " +
      "program layers on top of card cashback. Notably, Ace Hardware is one of the merchants that " +
      "earns 3% on the Apple Card via Apple Pay, alongside the home-improvement category match on " +
      "general-purpose cards.",
    also_earns: [
      {
        card: 'apple-card',
        rate: 3,
        unit: 'percent',
        note: 'Via Apple Pay',
      },
    ],
  },

  // ===== Groceries =====
  {
    slug: 'whole-foods-market',
    name: 'Whole Foods Market',
    aliases: ['Whole Foods', 'WFM'],
    categories: ['groceries'],
    website: 'https://www.wholefoodsmarket.com',
    parent_company: 'Amazon',
    intro:
      "Whole Foods Market is Amazon's premium grocery arm, with about 530 U.S. stores. Pricing is " +
      "higher than at mass-market supermarkets, which makes a strong grocery-category card more " +
      "valuable per visit. The standout here is the Amazon Prime Rewards Visa: it earns 5% at Whole " +
      "Foods (with a Prime membership), which is the strongest non-promotional grocery rate available. " +
      "Without Prime, fall back to whichever 3-6% supermarket card you carry.",
    also_earns: [
      {
        card: 'amazon-prime-rewards-visa-signature-card',
        rate: 5,
        unit: 'percent',
        note: 'With Amazon Prime membership',
      },
    ],
  },
  {
    slug: 'trader-joes',
    name: "Trader Joe's",
    aliases: ['Trader Joes', 'TJs'],
    categories: ['groceries'],
    website: 'https://www.traderjoes.com',
    intro:
      "Trader Joe's is the smaller-format private-label grocer with about 600 stores nationwide, " +
      "famous for store-brand goods and tight pricing. Average tickets are smaller than at full-line " +
      "supermarkets, but the visit frequency tends to be higher. TJ's codes cleanly as groceries " +
      "(supermarket merchant code) on essentially every card we track, so any standard 3-6% grocery " +
      "card will earn here.",
  },
  {
    slug: 'kroger',
    name: 'Kroger',
    aliases: [],
    categories: ['groceries'],
    website: 'https://www.kroger.com',
    intro:
      "Kroger is the largest dedicated U.S. supermarket operator, running about 2,700 stores under " +
      "Kroger and a stack of regional banners (Ralphs, Fred Meyer, Smith's, King Soopers, Harris " +
      "Teeter, Fry's, and others). All code as groceries at the register and most do online shopping " +
      "via the Kroger app/site. Any standard supermarket-bonus card earns here. Kroger's own " +
      "fuel-points program layers on top of card cashback.",
  },
  {
    slug: 'safeway',
    name: 'Safeway',
    aliases: [],
    categories: ['groceries'],
    website: 'https://www.safeway.com',
    parent_company: 'Albertsons Companies',
    intro:
      "Safeway is one of Albertsons' largest banners, running about 900 stores primarily in the " +
      "Western U.S. Safeway codes as groceries at the register and most online ordering happens " +
      "through safeway.com or DoorDash partnerships. Safeway's own Just for U digital coupons stack " +
      "with whatever card-side cashback you earn at checkout.",
  },
  {
    slug: 'publix',
    name: 'Publix',
    aliases: ['Publix Super Markets'],
    categories: ['groceries'],
    website: 'https://www.publix.com',
    intro:
      "Publix is the largest employee-owned U.S. supermarket chain, with about 1,400 stores " +
      "concentrated in the Southeast. Pricing skews higher than at mass-market grocers like Walmart " +
      "Neighborhood Market or Aldi, which makes a strong grocery-category card more valuable per " +
      "visit. Publix codes cleanly as groceries on every card we track.",
  },
  {
    slug: 'aldi',
    name: 'Aldi',
    aliases: ['ALDI'],
    categories: ['groceries'],
    website: 'https://www.aldi.us',
    intro:
      "Aldi is the discount-focused private-label grocer with about 2,400 U.S. stores and a sharply " +
      "lower price floor than full-line supermarkets. Average tickets are smaller, so the absolute " +
      "dollar value of a 3-6% grocery card is lower per visit, but the rate still applies. Aldi codes " +
      "as groceries on every card we track. Note: Aldi historically only accepted debit and SNAP, but " +
      "all U.S. stores now accept credit cards.",
  },
  {
    slug: 'wegmans',
    name: 'Wegmans',
    aliases: ['Wegmans Food Markets'],
    categories: ['groceries'],
    website: 'https://www.wegmans.com',
    intro:
      "Wegmans is a regional supermarket chain with about 110 stores in the Northeast, well-known for " +
      "prepared foods, in-store dining, and a deep wine and beer selection. Pricing skews mid-to-high " +
      "and average tickets are larger than at typical mass-market supermarkets. Wegmans codes as " +
      "groceries on essentially every card we track.",
  },
  {
    slug: 'heb',
    name: 'H-E-B',
    aliases: ['HEB', 'H-E-B Texas'],
    categories: ['groceries'],
    website: 'https://www.heb.com',
    intro:
      "H-E-B is the dominant Texas supermarket chain, with about 425 stores under H-E-B, Central " +
      "Market, and Joe V's banners. The chain is privately held and well-regarded for store-brand " +
      "products and Texas-only specialty items. H-E-B codes as groceries on every card we track and " +
      "supports curbside pickup and delivery on most product lines.",
  },
  {
    slug: 'albertsons',
    name: 'Albertsons',
    aliases: ['Albertsons Companies'],
    categories: ['groceries'],
    website: 'https://www.albertsons.com',
    intro:
      "Albertsons is a national supermarket operator with about 2,250 stores under the Albertsons, " +
      "Safeway, Vons, Jewel-Osco, Shaw's, Acme, Tom Thumb, and Randalls banners. All banners code as " +
      "groceries at the register and ship online through their respective apps and sites. Albertsons' " +
      "Just for U coupons stack with card-side rewards at checkout.",
  },

  // ===== Drugstores =====
  {
    slug: 'cvs',
    name: 'CVS',
    aliases: ['CVS Pharmacy'],
    categories: ['drugstores'],
    website: 'https://www.cvs.com',
    intro:
      "CVS is the largest U.S. pharmacy chain by store count (about 9,000 locations) and a major " +
      "convenience-goods retailer alongside the prescription business. CVS codes as a drugstore on " +
      "every card we track, so any 3-5% drugstore-category card will earn here. CVS's own ExtraCare " +
      "loyalty program runs in parallel and stacks with card cashback.",
  },
  {
    slug: 'walgreens',
    name: 'Walgreens',
    aliases: ['Walgreens Boots Alliance'],
    categories: ['drugstores'],
    website: 'https://www.walgreens.com',
    intro:
      "Walgreens is the second-largest U.S. pharmacy chain at about 8,500 stores, with a big " +
      "convenience-goods footprint alongside the pharmacy business. Walgreens codes as a drugstore " +
      "and is one of the merchants that earns 3% on the Apple Card via Apple Pay, in addition to " +
      "general drugstore-category bonuses on other cards.",
    also_earns: [
      {
        card: 'apple-card',
        rate: 3,
        unit: 'percent',
        note: 'Via Apple Pay',
      },
    ],
  },
  {
    slug: 'rite-aid',
    name: 'Rite Aid',
    aliases: [],
    categories: ['drugstores'],
    website: 'https://www.riteaid.com',
    intro:
      "Rite Aid is the third-largest U.S. pharmacy chain at about 1,700 stores, primarily in the " +
      "Northeast and West Coast. Rite Aid codes cleanly as a drugstore on every card we track, so " +
      "any drugstore-bonus card will earn here. The chain's BonusCash and wellness+ rewards programs " +
      "layer on top of card cashback.",
  },

  // ===== Gas =====
  {
    slug: 'shell',
    name: 'Shell',
    aliases: ['Shell Oil', 'Shell USA'],
    categories: ['gas'],
    website: 'https://www.shell.us',
    intro:
      "Shell is one of the largest U.S. gasoline retailers by station count (about 13,000 locations), " +
      "with a Fuel Rewards loyalty program tied to the Shell app. Shell pumps code cleanly as gas on " +
      "every card we track. The Shell Fuel Rewards program offers stackable per-gallon discounts that " +
      "are calculated separately from card cashback.",
  },
  {
    slug: 'exxonmobil',
    name: 'ExxonMobil',
    aliases: ['Exxon', 'Mobil'],
    categories: ['gas'],
    website: 'https://www.exxon.com',
    intro:
      "ExxonMobil operates Exxon and Mobil-branded stations at about 11,500 U.S. locations, plus the " +
      "ExxonMobil Rewards+ app for in-station discounts. ExxonMobil pumps code as gas on every card " +
      "we track, and one merchant-specific note: ExxonMobil purchases earn 3% on the Apple Card when " +
      "paid via Apple Pay.",
    also_earns: [
      {
        card: 'apple-card',
        rate: 3,
        unit: 'percent',
        note: 'Via Apple Pay',
      },
    ],
  },
  {
    slug: 'chevron',
    name: 'Chevron',
    aliases: ['Chevron Texaco', 'Texaco'],
    categories: ['gas'],
    website: 'https://www.chevron.com',
    intro:
      "Chevron and Texaco-branded stations cover about 8,000 U.S. locations primarily in the West " +
      "and South. Pumps code cleanly as gas on every card we track. The Chevron Visa offers extra " +
      "cents-per-gallon discounts at Chevron and Texaco stations, but most general-purpose " +
      "gas-bonus cards beat it on absolute cashback unless you're a heavy Chevron-only buyer.",
  },
  {
    slug: '7-eleven',
    name: '7-Eleven',
    aliases: ['7Eleven', 'Seven-Eleven'],
    categories: ['gas'],
    website: 'https://www.7-eleven.com',
    intro:
      "7-Eleven runs about 9,500 U.S. convenience stores, many with attached gas pumps. The pumps " +
      "code as gas on every card we track. In-store purchases (snacks, drinks, hot food) typically " +
      "code as convenience stores rather than as groceries or dining, which means most 3-5% category " +
      "bonuses don't apply to non-fuel purchases at 7-Eleven.",
  },

  // ===== Dining / QSR / delivery =====
  {
    slug: 'starbucks',
    name: 'Starbucks',
    aliases: ['Starbucks Coffee'],
    categories: ['dining'],
    website: 'https://www.starbucks.com',
    intro:
      "Starbucks runs about 16,500 U.S. stores plus the Starbucks app, which is itself one of the " +
      "largest closed-loop payment systems in the country. Whether you pay through the app, with a " +
      "physical Starbucks card, or directly with a credit card, the underlying Starbucks transaction " +
      "codes as dining/restaurants on every card we track. Reloading your Starbucks balance via card " +
      "is the cleanest way to capture the dining bonus on cards that pay 3-5% on dining.",
  },
  {
    slug: 'mcdonalds',
    name: "McDonald's",
    aliases: ['Mcdonalds', 'Mickey Ds'],
    categories: ['dining'],
    website: 'https://www.mcdonalds.com',
    intro:
      "McDonald's is the largest U.S. quick-service restaurant chain at about 13,500 locations. All " +
      "purchases — in-store, drive-thru, and via the McDonald's app — code as dining/restaurants on " +
      "every card we track, so any 3-5% dining-category card earns here. The McDonald's app's " +
      "MyMcDonald's Rewards program stacks on top of card cashback.",
  },
  {
    slug: 'chipotle',
    name: 'Chipotle',
    aliases: ['Chipotle Mexican Grill'],
    categories: ['dining'],
    website: 'https://www.chipotle.com',
    intro:
      "Chipotle is one of the largest U.S. fast-casual chains at about 3,500 locations, with a " +
      "well-developed digital ordering app and Chipotle Rewards loyalty program. All Chipotle " +
      "purchases code as dining/restaurants on every card we track, so 3-5% dining-bonus cards earn " +
      "at the same rate whether you order in-store, on the app, or for delivery direct from Chipotle.",
  },
  {
    slug: 'chick-fil-a',
    name: 'Chick-fil-A',
    aliases: ['Chick fil A'],
    categories: ['dining'],
    website: 'https://www.chick-fil-a.com',
    intro:
      "Chick-fil-A is one of the highest-grossing U.S. fast-food chains by per-store revenue, with " +
      "about 3,000 locations and a closed-loop app/loyalty program. All Chick-fil-A purchases code " +
      "as dining/restaurants on every card we track. App reloads of Chick-fil-A One credits also " +
      "trigger the dining category, which is a clean way to capture the bonus.",
  },
  {
    slug: 'dominos',
    name: "Domino's",
    aliases: ['Dominos', "Domino's Pizza"],
    categories: ['dining'],
    website: 'https://www.dominos.com',
    intro:
      "Domino's is the largest U.S. pizza chain at about 6,800 locations and a heavy digital ordering " +
      "footprint. All Domino's transactions — phone, app, and dominos.com — code as dining on every " +
      "card we track, regardless of whether the food is delivered or picked up. The Domino's Rewards " +
      "program (free pizza after a points threshold) stacks on top of card cashback.",
  },
  {
    slug: 'doordash',
    name: 'DoorDash',
    aliases: ['Door Dash'],
    categories: ['dining'],
    website: 'https://www.doordash.com',
    intro:
      "DoorDash is the largest U.S. food-delivery service by market share, covering both restaurant " +
      "delivery and (via DashMart and grocery partners) household goods. Restaurant orders code as " +
      "dining/restaurants on every card we track, and several cards specifically call out DoorDash " +
      "for elevated dining bonuses or DashPass perks. DashMart and grocery-partner orders typically " +
      "code as the underlying merchant rather than as dining.",
  },
  {
    slug: 'uber-eats',
    name: 'Uber Eats',
    aliases: ['UberEats'],
    categories: ['dining'],
    website: 'https://www.ubereats.com',
    intro:
      "Uber Eats is the second-largest U.S. food-delivery service and is bundled with Uber rideshare " +
      "for many users. Restaurant orders code as dining/restaurants on every card we track, and " +
      "several cards (notably the Amex Gold and Platinum) include Uber Cash credits that can be " +
      "applied to Uber Eats orders. Grocery orders through Uber Eats typically code as the " +
      "underlying merchant.",
  },

  // ===== Apparel & beauty =====
  // These don't map to an existing reward category, so we mark them as
  // online_shopping for the .com side and let the page fall back to
  // flat-rate honestly for in-store purchases.
  {
    slug: 'old-navy',
    name: 'Old Navy',
    aliases: [],
    categories: ['online_shopping'],
    website: 'https://www.oldnavy.gap.com',
    parent_company: 'Gap, Inc.',
    intro:
      "Old Navy is Gap, Inc.'s value-priced apparel banner with about 1,200 U.S. stores and a strong " +
      "online catalog. Apparel doesn't have a dedicated reward category on most general-purpose " +
      "credit cards, so card choice usually comes down to whether you're shopping online (where " +
      "online-shopping bonuses apply) or in-store (where you're typically falling back to a " +
      "strong flat-rate cashback card).",
  },
  {
    slug: 'lululemon',
    name: 'Lululemon',
    aliases: ['Lululemon Athletica'],
    categories: ['online_shopping'],
    website: 'https://www.lululemon.com',
    intro:
      "Lululemon is the dominant U.S. athletic-apparel brand with about 700 stores and a heavy " +
      "lululemon.com presence. Like other apparel retailers, Lululemon doesn't fall into a card " +
      "bonus category in-store — the right answer there is a strong flat-rate cashback card. Online " +
      "purchases at lululemon.com code as online shopping, which opens up a different set of " +
      "category bonuses.",
  },
  {
    slug: 'sephora',
    name: 'Sephora',
    aliases: [],
    categories: ['online_shopping'],
    website: 'https://www.sephora.com',
    intro:
      "Sephora is the largest U.S. beauty specialty retailer at about 600 stores, plus a separate " +
      "shop-in-shop presence inside Kohl's. Beauty doesn't have its own reward category on most " +
      "general-purpose cards, so in-store purchases at Sephora typically fall back to a flat-rate " +
      "cashback card. Online purchases at sephora.com code as online shopping. Sephora's own Beauty " +
      "Insider points layer on top of card cashback.",
  },
  {
    slug: 'ulta',
    name: 'Ulta Beauty',
    aliases: ['Ulta'],
    categories: ['online_shopping'],
    website: 'https://www.ulta.com',
    intro:
      "Ulta Beauty is the largest U.S. beauty retailer by store count at about 1,400 locations, " +
      "covering both prestige and mass-market lines under one roof. Like Sephora, Ulta in-store " +
      "purchases don't trigger a dedicated card category, so the right card there is usually a " +
      "strong flat-rate. Online purchases at ulta.com code as online shopping. Ultamate Rewards " +
      "loyalty points stack with card cashback.",
  },

  // ===== Pet =====
  {
    slug: 'chewy',
    name: 'Chewy',
    aliases: [],
    categories: ['online_shopping'],
    website: 'https://www.chewy.com',
    intro:
      "Chewy is the largest dedicated U.S. online pet retailer, with autoship being the dominant " +
      "purchase pattern for repeat customers. All Chewy purchases code as online shopping on every " +
      "card we track. Pet-supply spend doesn't fall into a dedicated card category on most " +
      "general-purpose cards, so the right answer here is whichever U.S. online retail card you " +
      "carry — Blue Cash Everyday, Hilton Surpass, or a flat 2% card depending on cap considerations.",
  },
  {
    slug: 'petsmart',
    name: 'PetSmart',
    aliases: [],
    categories: ['online_shopping'],
    website: 'https://www.petsmart.com',
    intro:
      "PetSmart is the largest U.S. pet specialty retailer by store count at about 1,650 locations, " +
      "with a sizable petsmart.com online catalog. Pet-supply purchases don't have a dedicated " +
      "category on most credit cards, so in-store purchases generally fall back to a flat-rate " +
      "cashback card. Online purchases at petsmart.com code as online shopping. The Treats Rewards " +
      "loyalty program stacks on top of card cashback.",
  },
];

console.log(`Generating ${stores.length} store YAMLs...`);

if (!fs.existsSync(STORES_DIR)) fs.mkdirSync(STORES_DIR, { recursive: true });

function yamlEscape(str) {
  // Single-line strings: wrap in double quotes if they contain special chars,
  // otherwise leave bare. We always use double-quoted for safety here.
  return '"' + String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function toYaml(store) {
  const lines = [];
  lines.push(`name: ${yamlEscape(store.name)}`);
  lines.push(`slug: ${yamlEscape(store.slug)}`);
  if (store.aliases && store.aliases.length) {
    lines.push('aliases:');
    for (const a of store.aliases) lines.push(`  - ${yamlEscape(a)}`);
  }
  lines.push('categories:');
  for (const c of store.categories) lines.push(`  - ${c}`);
  lines.push(`website: ${yamlEscape(store.website)}`);
  if (store.parent_company) lines.push(`parent_company: ${yamlEscape(store.parent_company)}`);
  if (store.also_earns) {
    lines.push('also_earns:');
    for (const e of store.also_earns) {
      lines.push(`  - card: ${yamlEscape(e.card)}`);
      lines.push(`    rate: ${e.rate}`);
      lines.push(`    unit: ${e.unit}`);
      if (e.note) lines.push(`    note: ${yamlEscape(e.note)}`);
    }
  }
  // Block-scalar intro — no need to escape internal quotes; YAML | preserves
  // newlines, but we collapsed everything to a single paragraph already.
  lines.push('intro: |');
  // Wrap to ~88 chars for readability in YAML
  const words = store.intro.split(/\s+/);
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 88) {
      lines.push('  ' + line.trim());
      line = w;
    } else {
      line += ' ' + w;
    }
  }
  if (line.trim()) lines.push('  ' + line.trim());
  return lines.join('\n') + '\n';
}

let written = 0;
for (const store of stores) {
  const filePath = path.join(STORES_DIR, `${store.slug}.yaml`);
  fs.writeFileSync(filePath, toYaml(store));
  written++;
}

console.log(`Wrote ${written} store YAMLs to ${STORES_DIR}`);
