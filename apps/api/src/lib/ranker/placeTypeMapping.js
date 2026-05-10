// Maps Google Places API "primaryType" / "types" values to the reward
// categories defined in categoryLabels.js. The mapping is intentionally
// small — anything that doesn't match falls through to `everything_else`,
// which is also the catch-all that every wallet card usually rewards at 1x.
//
// Each match returns *two* layers of categories:
//   1. `primary`  — the generic taxonomy slug (dining, gas, transit…) used
//      for labelling the merchant row and for the early-return on
//      everything_else.
//   2. `categories` — the primary plus any *issuer-specific subtype* slugs
//      that apply (fast_food, movie_theaters, ground_transportation…) so a
//      Cash+ user's "Movie Theaters" pick actually matches an AMC place.
//
// This means `categories` is always a superset of `[primary]`. The ranker
// already iterates an array of categories per store, so multi-matching is
// transparent — a merchant just carries every applicable bucket.
//
// Reference for Google place types:
// https://developers.google.com/maps/documentation/places/web-service/place-types

const BRAND_TO_CATEGORY = [
  { match: "whole foods", category: "amazon" },
  { match: "amazon fresh", category: "amazon" },
  { match: "amazon go", category: "amazon" },
  { match: "rei", category: "rei" },
];

const PRIMARY_TYPE_TO_CATEGORY = {
  // dining
  restaurant: "dining",
  cafe: "dining",
  coffee_shop: "dining",
  bar: "dining",
  meal_takeaway: "dining",
  meal_delivery: "dining",
  bakery: "dining",
  fast_food_restaurant: "dining",
  ice_cream_shop: "dining",
  pizza_restaurant: "dining",
  sandwich_shop: "dining",
  // groceries
  supermarket: "groceries",
  grocery_store: "groceries",
  grocery_or_supermarket: "groceries",
  convenience_store: "groceries",
  food_store: "groceries",
  liquor_store: "groceries",
  wholesale_store: "groceries",
  // gas
  gas_station: "gas",
  // drugstores
  pharmacy: "drugstores",
  drugstore: "drugstores",
  // transit
  transit_station: "transit",
  bus_station: "transit",
  subway_station: "transit",
  train_station: "transit",
  taxi_stand: "transit",
  light_rail_station: "transit",
  // hotels — keep `lodging` and `bed_and_breakfast` as defensive fallbacks
  // even though the Lambda excludes them server-side.
  lodging: "hotels",
  hotel: "hotels",
  motel: "hotels",
  resort_hotel: "hotels",
  extended_stay_hotel: "hotels",
  inn: "hotels",
  bed_and_breakfast: "hotels",
  // airlines / travel
  airport: "airlines",
  travel_agency: "travel",
  // car rentals
  car_rental: "car_rentals",
  // entertainment
  movie_theater: "entertainment",
  amusement_park: "entertainment",
  bowling_alley: "entertainment",
  zoo: "entertainment",
  aquarium: "entertainment",
  stadium: "entertainment",
  night_club: "entertainment",
  // home improvement
  home_goods_store: "home_improvement",
  hardware_store: "home_improvement",
};

const PRIMARY_TYPE_SUBTYPES = {
  fast_food_restaurant: ["fast_food"],
  meal_takeaway: ["fast_food"],
  movie_theater: ["movie_theaters"],
  electronics_store: ["electronics_stores"],
  furniture_store: ["furniture_stores"],
  gym: ["gyms_fitness"],
  fitness_center: ["gyms_fitness"],
  sporting_goods_store: ["sporting_goods"],
  taxi_stand: ["ground_transportation"],
  bus_station: ["ground_transportation"],
  subway_station: ["ground_transportation"],
  train_station: ["ground_transportation"],
  light_rail_station: ["ground_transportation"],
  transit_station: ["ground_transportation"],
};

function withSubtypes(primary, sourceType) {
  if (!sourceType) return [primary];
  const subtypes = PRIMARY_TYPE_SUBTYPES[sourceType];
  return subtypes ? [primary, ...subtypes] : [primary];
}

function mapPlaceToCategory(place) {
  const lowerName = (place.name || "").toLowerCase();
  for (const { match, category } of BRAND_TO_CATEGORY) {
    if (lowerName.includes(match)) {
      return {
        primary: category,
        categories: [category],
        matchedBy: "brand",
        matchedValue: match,
      };
    }
  }
  if (place.primaryType && PRIMARY_TYPE_TO_CATEGORY[place.primaryType]) {
    const primary = PRIMARY_TYPE_TO_CATEGORY[place.primaryType];
    return {
      primary,
      categories: withSubtypes(primary, place.primaryType),
      matchedBy: "primaryType",
      matchedValue: place.primaryType,
    };
  }
  if (place.types) {
    for (const t of place.types) {
      if (PRIMARY_TYPE_TO_CATEGORY[t]) {
        const primary = PRIMARY_TYPE_TO_CATEGORY[t];
        return {
          primary,
          categories: withSubtypes(primary, t),
          matchedBy: "type",
          matchedValue: t,
        };
      }
    }
    for (const t of place.types) {
      const subs = PRIMARY_TYPE_SUBTYPES[t];
      if (subs && subs.length > 0) {
        return {
          primary: subs[0],
          categories: subs,
          matchedBy: "subtype",
          matchedValue: t,
        };
      }
    }
  }
  return { primary: "everything_else", categories: ["everything_else"], matchedBy: "fallback" };
}

module.exports = { mapPlaceToCategory };
