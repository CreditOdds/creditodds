// POST /wallet-picks/nearby
//
// Combines the legacy /nearby-recommendations Places lookup with the
// wallet-aware card matcher. Returns the merchants near (lat, lng) that
// have a card recommendation for the authenticated user, fully resolved
// (no client-side ranker needed). Replaces the
// places-then-rank-on-client pattern that BestCardHere.tsx used to run.
//
// Request body:  { lat: number, lng: number }
// Response:      { merchants: [{ place, match }], cached: boolean }
// Auth required.
//
// The Places list is cached per ~110m grid for 10 min (places.js).
// Match output is per-user so it is NOT cached here.

const mysql = require("../db");
const { searchNearby } = require("../lib/ranker/places");
const {
  getAllCards,
  getBrandIndex,
} = require("../lib/ranker/data-loaders");
const { loadUserWallet } = require("../lib/ranker/user-wallet-loader");
const {
  pickWalletCardsForPlace,
} = require("../lib/ranker/walletPicksForPlace");

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const DAILY_USER_CAP = 30;
const userUsage = new Map();

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

function ok(payload) {
  return {
    statusCode: 200,
    headers: responseHeaders,
    body: JSON.stringify(payload),
  };
}

exports.WalletPicksNearbyHandler = async (event) => {
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

  try {
    // Run the three independent fetches concurrently. Places is the
    // slowest (~150–400ms cold), cards.json is CDN-cached but adds another
    // hop, and the user wallet is a DB round-trip.
    const [{ places, cached }, allCards, walletRows] = await Promise.all([
      searchNearby(lat, lng, apiKey),
      getAllCards(),
      loadUserWallet(userId),
    ]);
    await mysql.end();

    const brandIndex = getBrandIndex();

    const merchants = [];
    for (const place of places) {
      const match = pickWalletCardsForPlace(walletRows, allCards, place, brandIndex);
      if (!match) continue;
      merchants.push({ place, match });
    }

    return ok({ merchants, cached });
  } catch (e) {
    console.error("wallet-picks-nearby failed:", e);
    return err(502, "Failed to compute nearby wallet picks");
  }
};
