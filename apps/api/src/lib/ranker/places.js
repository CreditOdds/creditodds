// Google Places (New) "Search Nearby" wrapper. Used by the
// /wallet-picks/nearby handler. The legacy /nearby-recommendations
// endpoint that originally shared this helper was retired once iOS
// migrated to /wallet-picks/nearby; the helper stayed because it keeps
// the Place-types whitelist co-located with the Places call.
//
// Caching: a small in-memory map keyed on a ~110m location grid, 10-min
// TTL. Survives within a warm Lambda container — cold start resets it.
// That's fine for a beta surface; move to ElastiCache if abuse appears.

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";

const INCLUDED_TYPES = [
  "restaurant",
  "cafe",
  "coffee_shop",
  "bar",
  "fast_food_restaurant",
  "bakery",
  "meal_takeaway",
  "meal_delivery",
  "sandwich_shop",
  "pizza_restaurant",
  "ice_cream_shop",
  "supermarket",
  "grocery_store",
  "convenience_store",
  "liquor_store",
  "gas_station",
  "pharmacy",
  "drugstore",
  "department_store",
  "clothing_store",
  "shopping_mall",
  "home_goods_store",
  "hardware_store",
  "electronics_store",
  "furniture_store",
  "sporting_goods_store",
  "gym",
  "fitness_center",
  "hotel",
  "motel",
  "resort_hotel",
  "extended_stay_hotel",
  "inn",
  "car_rental",
  "movie_theater",
];

const EXCLUDED_TYPES = [
  "bed_and_breakfast",
  "private_guest_room",
  "guest_house",
  "cottage",
  "farmstay",
  "hostel",
  "japanese_inn",
  "campground",
  "camping_cabin",
  "mobile_home_park",
  "rv_park",
];

const RADIUS_METERS = 1000;
const MAX_RESULTS = 10;
const CACHE_TTL_MS = 10 * 60 * 1000;
const GRID_PRECISION = 3; // ~110m squares

const placesCache = new Map();

function gridKey(lat, lng) {
  return `${Number(lat).toFixed(GRID_PRECISION)},${Number(lng).toFixed(GRID_PRECISION)}`;
}

async function callPlacesApi(lat, lng, apiKey) {
  const res = await fetch(PLACES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.location,places.types,places.primaryType,places.formattedAddress,places.businessStatus",
    },
    body: JSON.stringify({
      includedTypes: INCLUDED_TYPES,
      excludedTypes: EXCLUDED_TYPES,
      maxResultCount: MAX_RESULTS,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: RADIUS_METERS,
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Places API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const places = Array.isArray(data.places) ? data.places : [];
  return places
    .filter((p) => !p.businessStatus || p.businessStatus === "OPERATIONAL")
    .map((p) => ({
      id: p.id,
      name: p.displayName?.text || "",
      primaryType: p.primaryType || null,
      types: Array.isArray(p.types) ? p.types : [],
      address: p.formattedAddress || null,
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
    }));
}

async function searchNearby(lat, lng, apiKey) {
  const key = gridKey(lat, lng);
  const now = Date.now();
  const cached = placesCache.get(key);
  if (cached && cached.expiresAt > now) {
    return { places: cached.data, cached: true };
  }
  const places = await callPlacesApi(lat, lng, apiKey);
  placesCache.set(key, { expiresAt: now + CACHE_TTL_MS, data: places });
  return { places, cached: false };
}

module.exports = {
  searchNearby,
  // Re-exported for the legacy handler that wants to share the same lists.
  INCLUDED_TYPES,
  EXCLUDED_TYPES,
};
