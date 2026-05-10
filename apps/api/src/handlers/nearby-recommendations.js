// Nearby Recommendations — fetches a small list of nearby businesses from
// Google Places API (New) so the wallet UI can suggest the best card per
// place. Field-masked to stay on the Pro SKU. The response is intentionally
// thin (id, name, types, location) — category mapping and best-card picking
// happen on the frontend where the user's wallet + card data already live.

// Lambda runtime is Node 22 (see template.yml), so global fetch is available.

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";

// Curated subset of Place types relevant to credit-card categories. Keeps
// results signal-heavy (no parks, schools, churches) and lets the API
// filter server-side. See data/places-types.md for the full mapping.
//
// Lodging note: we deliberately list specific hotel subtypes instead of the
// generic `lodging` parent. `lodging` pulls in the entire family — including
// `private_guest_room`, `bed_and_breakfast`, `cottage`, `farmstay`,
// `campground`, `rv_park`, etc. — which surfaces Airbnb-style rentals and
// non-business pins. Pair with `EXCLUDED_TYPES` below as belt-and-suspenders
// in case a hotel is mistagged with a rental subtype.
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

// Vacation rentals, hostels, campgrounds, and similar lodging subtypes.
// Even with the narrowed `INCLUDED_TYPES`, Google can return a place that
// also carries one of these tags — excluding them here drops it.
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
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const GRID_PRECISION = 3; // ~110m squares
const DAILY_USER_CAP = 30;

// In-memory caches scoped to a warm Lambda container. They reset on cold
// start, which is fine for a beta — the worst case is one extra Places
// call per cold start. Move to DynamoDB / Redis if abuse becomes an issue.
const placesCache = new Map(); // key: "lat,lng" -> { expiresAt, data }
const userUsage = new Map();   // key: userId -> { dayKey, count }

function gridKey(lat, lng) {
  return `${Number(lat).toFixed(GRID_PRECISION)},${Number(lng).toFixed(GRID_PRECISION)}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function bumpUserUsage(userId) {
  const today = todayKey();
  const cur = userUsage.get(userId);
  if (!cur || cur.dayKey !== today) {
    userUsage.set(userId, { dayKey: today, count: 1 });
    return 1;
  }
  cur.count += 1;
  return cur.count;
}

function err(statusCode, message) {
  return {
    statusCode,
    headers: responseHeaders,
    body: JSON.stringify({ error: message }),
  };
}

async function searchNearby(lat, lng, apiKey) {
  const res = await fetch(PLACES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      // Field mask is required and controls billing tier.
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

exports.NearbyRecommendationsHandler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: responseHeaders, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return err(405, `Method ${event.httpMethod} not allowed`);
  }

  const userId = event.requestContext?.authorizer?.principalId;
  if (!userId) return err(401, "Unauthorized");

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_PLACES_API_KEY not set");
    return err(503, "Nearby recommendations are not configured");
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return err(400, "Invalid JSON body");
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180
  ) {
    return err(400, "lat and lng must be valid coordinates");
  }

  const usage = bumpUserUsage(userId);
  if (usage > DAILY_USER_CAP) {
    return err(429, `Daily limit of ${DAILY_USER_CAP} nearby lookups reached`);
  }

  const cacheKey = gridKey(lat, lng);
  const cached = placesCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ places: cached.data, cached: true }),
    };
  }

  try {
    const places = await searchNearby(lat, lng, apiKey);
    placesCache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, data: places });
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ places, cached: false }),
    };
  } catch (e) {
    console.error("Places fetch failed:", e);
    return err(502, "Failed to fetch nearby places");
  }
};
