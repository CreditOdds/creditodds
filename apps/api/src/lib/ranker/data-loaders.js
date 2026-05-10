// Data-loading helpers for the wallet-picks Lambda handlers.
//
// - stores.json is bundled in the Lambda zip (see scripts/build-stores.js,
//   which mirrors data/stores.json into this directory).
// - cards.json is fetched from CloudFront per cold start. The existing
//   nearby-recommendations / card-by-id / all-cards handlers do the same
//   per request; we cache at module scope here with a short TTL to keep
//   warm-container wallet picks fast without holding stale data forever.

const https = require("https");
const path = require("path");
const fs = require("fs");

const CARDS_URL =
  process.env.CARDS_JSON_URL || "https://d2hxvzw7msbtvt.cloudfront.net/cards.json";

const CARDS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — matches the CDN/ISR layers
let cardsCache = null; // { expiresAt, data }

function fetchCardsFromCDN() {
  return new Promise((resolve, reject) => {
    https
      .get(CARDS_URL, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(Array.isArray(json.cards) ? json.cards : []);
          } catch (err) {
            reject(new Error("Failed to parse cards.json"));
          }
        });
      })
      .on("error", reject);
  });
}

async function getAllCards() {
  const now = Date.now();
  if (cardsCache && cardsCache.expiresAt > now) {
    return cardsCache.data;
  }
  const cards = await fetchCardsFromCDN();
  cardsCache = { expiresAt: now + CARDS_CACHE_TTL_MS, data: cards };
  return cards;
}

// stores.json — bundled in CodeUri, loaded once at module init.
const STORES_PATH = path.join(__dirname, "stores.json");
let storesData = null;

function getStoresData() {
  if (!storesData) {
    const raw = fs.readFileSync(STORES_PATH, "utf8");
    storesData = JSON.parse(raw);
  }
  return storesData;
}

// Full store records — used by the store endpoint for ranking (needs
// `also_earns` and the full category list).
function getStoreBySlug(slug) {
  const stores = getStoresData().stores || [];
  return stores.find((s) => s.slug === slug) || null;
}

// Slim brand index — used by the nearby endpoint for place-name → brand
// matching. Strips heavy fields (intro, faq, also_earns) the matcher
// doesn't need.
let brandIndexCache = null;
function getBrandIndex() {
  if (brandIndexCache) return brandIndexCache;
  const stores = getStoresData().stores || [];
  brandIndexCache = stores.map((s) => ({
    slug: s.slug,
    name: s.name,
    aliases: s.aliases,
    categories: s.categories,
    co_brand_cards: s.co_brand_cards,
  }));
  return brandIndexCache;
}

module.exports = {
  getAllCards,
  getStoreBySlug,
  getBrandIndex,
};
