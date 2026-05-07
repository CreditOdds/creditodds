// Maps Google Places API "primaryType" / "types" values to the reward
// categories defined in cardDisplayUtils.tsx (categoryLabels). The mapping
// is intentionally small — anything that doesn't match falls through to
// `everything_else`, which is also the catch-all that every wallet card
// usually rewards at 1x.
//
// Reference for Google place types:
// https://developers.google.com/maps/documentation/places/web-service/place-types

// Brand overrides — tested against placeName.toLowerCase() with substring
// match. Used to bias toward a more specific category when a generic
// place type would lose information (Whole Foods is a grocery store but
// also Amazon-branded; Costco is a grocery+merchandise hybrid but a
// dedicated Costco card is the right pick for the user).
const BRAND_TO_CATEGORY: Array<{ match: string; category: string }> = [
  { match: 'whole foods', category: 'amazon' },
  { match: 'amazon fresh', category: 'amazon' },
  { match: 'amazon go', category: 'amazon' },
  { match: 'rei', category: 'rei' },
];

const PRIMARY_TYPE_TO_CATEGORY: Record<string, string> = {
  // dining
  restaurant: 'dining',
  cafe: 'dining',
  coffee_shop: 'dining',
  bar: 'dining',
  meal_takeaway: 'dining',
  meal_delivery: 'dining',
  bakery: 'dining',
  fast_food_restaurant: 'dining',
  ice_cream_shop: 'dining',
  pizza_restaurant: 'dining',
  sandwich_shop: 'dining',
  // groceries
  supermarket: 'groceries',
  grocery_store: 'groceries',
  grocery_or_supermarket: 'groceries',
  // gas
  gas_station: 'gas',
  // drugstores
  pharmacy: 'drugstores',
  drugstore: 'drugstores',
  // transit
  transit_station: 'transit',
  bus_station: 'transit',
  subway_station: 'transit',
  train_station: 'transit',
  taxi_stand: 'transit',
  light_rail_station: 'transit',
  // hotels
  lodging: 'hotels',
  hotel: 'hotels',
  motel: 'hotels',
  resort_hotel: 'hotels',
  bed_and_breakfast: 'hotels',
  // airlines / travel
  airport: 'airlines',
  travel_agency: 'travel',
  // car rentals
  car_rental: 'car_rentals',
  // entertainment
  movie_theater: 'entertainment',
  amusement_park: 'entertainment',
  bowling_alley: 'entertainment',
  zoo: 'entertainment',
  aquarium: 'entertainment',
  stadium: 'entertainment',
  night_club: 'entertainment',
  // home improvement
  home_goods_store: 'home_improvement',
  hardware_store: 'home_improvement',
};

export interface PlaceCategoryMatch {
  category: string;
  matchedBy: 'brand' | 'primaryType' | 'type' | 'fallback';
  matchedValue?: string;
}

export function mapPlaceToCategory(place: {
  name?: string;
  primaryType?: string;
  types?: string[];
}): PlaceCategoryMatch {
  const lowerName = (place.name || '').toLowerCase();
  for (const { match, category } of BRAND_TO_CATEGORY) {
    if (lowerName.includes(match)) {
      return { category, matchedBy: 'brand', matchedValue: match };
    }
  }
  if (place.primaryType && PRIMARY_TYPE_TO_CATEGORY[place.primaryType]) {
    return {
      category: PRIMARY_TYPE_TO_CATEGORY[place.primaryType],
      matchedBy: 'primaryType',
      matchedValue: place.primaryType,
    };
  }
  if (place.types) {
    for (const t of place.types) {
      if (PRIMARY_TYPE_TO_CATEGORY[t]) {
        return {
          category: PRIMARY_TYPE_TO_CATEGORY[t],
          matchedBy: 'type',
          matchedValue: t,
        };
      }
    }
  }
  return { category: 'everything_else', matchedBy: 'fallback' };
}
