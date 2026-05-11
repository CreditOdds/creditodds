// Map Plaid Personal Finance Categories (PFC) → CreditOdds reward category ids.
//
// Plaid's PFC has a primary level (~17 categories) and a more specific detailed
// level (~120). We try detailed first, fall back to primary, then to "general".
//
// CreditOdds category ids match the `category` field on card.rewards entries
// (defined in data/categories.yaml + cards/*.yaml). Keep in sync.
//
// This mapping is intentionally conservative — we'd rather drop a transaction
// into "general" than misattribute a category bonus the issuer wouldn't actually
// pay out on.

const PFC_DETAILED_TO_CATEGORY: Record<string, string> = {
  // Food & drink
  FOOD_AND_DRINK_GROCERIES: 'groceries',
  FOOD_AND_DRINK_RESTAURANT: 'dining',
  FOOD_AND_DRINK_FAST_FOOD: 'dining',
  FOOD_AND_DRINK_COFFEE: 'dining',
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: 'dining',
  FOOD_AND_DRINK_VENDING_MACHINES: 'dining',
  FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK: 'dining',

  // Transportation
  TRANSPORTATION_GAS: 'gas',
  TRANSPORTATION_PUBLIC_TRANSIT: 'transit',
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: 'rideshare',
  TRANSPORTATION_PARKING: 'transit',
  TRANSPORTATION_TOLLS: 'transit',
  TRANSPORTATION_BIKES_AND_SCOOTERS: 'transit',

  // Travel
  TRAVEL_AIRLINES_AND_AVIATION_SERVICES: 'travel',
  TRAVEL_LODGING: 'travel',
  TRAVEL_RENTAL_CARS: 'travel',
  TRAVEL_CRUISES: 'travel',
  TRAVEL_OTHER_TRAVEL: 'travel',

  // Shopping
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: 'online_shopping',
  GENERAL_MERCHANDISE_DEPARTMENT_STORES: 'department_stores',
  GENERAL_MERCHANDISE_SUPERSTORES: 'wholesale_clubs',
  GENERAL_MERCHANDISE_DISCOUNT_STORES: 'general',
  GENERAL_MERCHANDISE_PHARMACIES_AND_SUPPLEMENTS: 'drugstores',
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: 'general',
  GENERAL_MERCHANDISE_ELECTRONICS: 'general',
  GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: 'general',
  GENERAL_MERCHANDISE_OFFICE_SUPPLIES: 'office_supplies',
  GENERAL_MERCHANDISE_PET_SUPPLIES: 'general',
  GENERAL_MERCHANDISE_TOBACCO_AND_VAPE: 'general',
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: 'general',
  GENERAL_MERCHANDISE_CONVENIENCE_STORES: 'general',
  GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE: 'general',

  // Home
  HOME_IMPROVEMENT_HARDWARE: 'home_improvement',
  HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: 'home_improvement',
  HOME_IMPROVEMENT_FURNITURE: 'home_improvement',

  // Entertainment / streaming
  ENTERTAINMENT_TV_AND_MOVIES: 'streaming',
  ENTERTAINMENT_MUSIC_AND_AUDIO: 'streaming',
  ENTERTAINMENT_VIDEO_GAMES: 'entertainment',
  ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: 'entertainment',
  ENTERTAINMENT_CASINOS_AND_GAMBLING: 'entertainment',

  // Personal care
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: 'general',
  PERSONAL_CARE_HAIR_AND_BEAUTY: 'general',

  // Medical
  MEDICAL_PRIMARY_CARE: 'general',
  MEDICAL_DENTAL_CARE: 'general',
  MEDICAL_EYE_CARE: 'general',
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: 'drugstores',
  MEDICAL_VETERINARY_SERVICES: 'general',

  // Bills / services
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: 'utilities',
  RENT_AND_UTILITIES_TELEPHONE: 'utilities',
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: 'utilities',
  RENT_AND_UTILITIES_WATER: 'utilities',
};

const PFC_PRIMARY_TO_CATEGORY: Record<string, string> = {
  FOOD_AND_DRINK: 'dining',
  TRANSPORTATION: 'gas',
  TRAVEL: 'travel',
  ENTERTAINMENT: 'entertainment',
  GENERAL_MERCHANDISE: 'general',
  HOME_IMPROVEMENT: 'home_improvement',
  RENT_AND_UTILITIES: 'utilities',
  MEDICAL: 'general',
  PERSONAL_CARE: 'general',
};

export function pfcToCategory(primary: string | null, detailed: string | null): string {
  if (detailed && PFC_DETAILED_TO_CATEGORY[detailed]) return PFC_DETAILED_TO_CATEGORY[detailed];
  if (primary && PFC_PRIMARY_TO_CATEGORY[primary]) return PFC_PRIMARY_TO_CATEGORY[primary];
  return 'general';
}

// Friendly label for a CreditOdds category id. Mirrors the labels in
// `apps/web-next/src/lib/storeRanking.ts` / `data/categories.yaml`.
const CATEGORY_LABELS: Record<string, string> = {
  dining: 'Dining',
  groceries: 'Groceries',
  gas: 'Gas',
  travel: 'Travel',
  transit: 'Transit',
  rideshare: 'Rideshare',
  online_shopping: 'Online shopping',
  department_stores: 'Department stores',
  wholesale_clubs: 'Wholesale clubs',
  drugstores: 'Drugstores',
  home_improvement: 'Home improvement',
  streaming: 'Streaming',
  entertainment: 'Entertainment',
  utilities: 'Utilities',
  office_supplies: 'Office supplies',
  general: 'General',
};

export function categoryLabel(id: string): string {
  return CATEGORY_LABELS[id] || id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
