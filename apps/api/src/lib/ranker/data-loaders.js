// Data-loading helpers for the wallet-picks Lambda handlers.
//
// - stores.json is require()'d so esbuild inlines it into each handler's
//   bundle (see scripts/build-stores.js, which mirrors data/stores.json into
//   this directory). It must NOT be read as a loose file via fs/__dirname:
//   under `BuildMethod: esbuild` the data file isn't copied next to the
//   bundle, so a runtime read throws ENOENT and 500s every wallet-picks call.
// - cards.json comes from the shared CDN fetcher (../cards-cdn), which
//   caches the raw card list at module scope for 5 minutes and handles the
//   warm-container ECONNRESET retry + idle timeout. The cache below is a
//   second, separate layer: it holds the DB-*enriched* card list so warm
//   wallet-picks calls also skip the cards-table metadata query.

const mysql = require("../../db");
const { fetchCardsFromCDN } = require("../cards-cdn");

const CARDS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — matches the CDN/ISR layers
let cardsCache = null; // { expiresAt, data }

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
  const [cdnCardsRaw, dbByName] = await Promise.all([
    fetchCardsFromCDN(),
    fetchCardDbMetadata(),
  ]);
  // The shared fetcher returns json.cards as-is (undefined if the key is
  // missing); the previous local fetcher guaranteed an array, so keep that.
  const cdnCards = Array.isArray(cdnCardsRaw) ? cdnCardsRaw : [];
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

// stores.json — inlined into the bundle at build time via require() so the
// data survives esbuild bundling (a loose-file read would not).
const storesData = require("./stores.json");

function getStoresData() {
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
