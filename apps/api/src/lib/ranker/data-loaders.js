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
const mysql = require("../../db");

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

// Merge in the same DB-sourced fields that `all-cards.js` exposes — the
// frontend expects `card_image_link` (used by <CardImage>) and
// `db_card_id` (used by the BCH merchant-report payload). Without this
// merge the wallet-picks responses are missing the image URL and
// CardImage falls back to the generic SVG.
//
// The DB lookup is wrapped in try/catch so a transient failure degrades
// to "no images" rather than 500ing the whole wallet-picks call. Stays
// in sync with all-cards.js: DB-side `card_image_link` wins, with
// `card.image` (the YAML filename in cards.json) as the CDN fallback.
async function fetchCardDbMetadata() {
  try {
    const rows = await mysql.query(
      `SELECT card_id, card_name, card_image_link, accepting_applications FROM cards`,
    );
    // Connection release stays with the handler — running `mysql.end()` here
    // while `loadUserWallet` is mid-flight (via Promise.all) can yank the
    // pool out from under it.
    const byName = new Map();
    for (const row of rows) {
      byName.set(row.card_name, {
        db_card_id: row.card_id,
        card_image_link: row.card_image_link,
        accepting_applications: row.accepting_applications === 1,
      });
    }
    return byName;
  } catch (err) {
    console.error("fetchCardDbMetadata failed (continuing without enrichment):", err.message);
    return new Map();
  }
}

async function getAllCards() {
  const now = Date.now();
  if (cardsCache && cardsCache.expiresAt > now) {
    return cardsCache.data;
  }
  const [cdnCards, dbByName] = await Promise.all([
    fetchCardsFromCDN(),
    fetchCardDbMetadata(),
  ]);
  const enriched = cdnCards.map((c) => {
    const db = dbByName.get(c.card_name) || dbByName.get(c.name) || {};
    return {
      ...c,
      db_card_id: db.db_card_id ?? null,
      card_image_link: db.card_image_link || c.image || null,
      accepting_applications:
        db.accepting_applications !== undefined
          ? db.accepting_applications
          : c.accepting_applications,
    };
  });
  cardsCache = { expiresAt: now + CARDS_CACHE_TTL_MS, data: enriched };
  return enriched;
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
