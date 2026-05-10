// POST /wallet-picks/store
//
// Returns the authenticated user's best wallet cards for a given store
// brand (matched by slug). Replaces the client-side `rankCards` call
// in StorePersonalRow.tsx so the matching engine lives on the backend.
//
// Request body:  { store_slug: string, maxPicks?: number }
// Response:      { picks: RankedPick[], store: { slug, name } }
// Auth required.

const mysql = require("../db");
const { rankCards } = require("../lib/ranker/storeRanking");
const { getAllCards, getStoreBySlug } = require("../lib/ranker/data-loaders");
const { loadUserWallet } = require("../lib/ranker/user-wallet-loader");

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

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

exports.WalletPicksStoreHandler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: responseHeaders, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return err(405, `Method ${event.httpMethod} not allowed`);
  }

  const userId = event.requestContext?.authorizer?.principalId;
  if (!userId) return err(401, "Unauthorized");

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return err(400, "Invalid JSON body");
  }

  const storeSlug = typeof body.store_slug === "string" ? body.store_slug.trim() : "";
  if (!storeSlug) return err(400, "store_slug is required");

  const maxPicks = Number.isInteger(body.maxPicks) && body.maxPicks > 0 && body.maxPicks <= 20
    ? body.maxPicks
    : 10;

  const store = getStoreBySlug(storeSlug);
  if (!store) return err(404, `Unknown store: ${storeSlug}`);

  try {
    const [walletRows, allCards] = await Promise.all([
      loadUserWallet(userId),
      getAllCards(),
    ]);
    await mysql.end();

    if (walletRows.length === 0) {
      return ok({ picks: [], store: { slug: store.slug, name: store.name } });
    }

    // Map wallet rows -> card slugs the ranker can match against.
    // Skip wallet rows whose card_name doesn't resolve in cards.json
    // (e.g. a card was renamed in the DB but not yet synced to the CDN).
    const cardsByName = new Map(allCards.map((c) => [c.card_name, c]));
    const walletCardSlugs = [];
    const userSelections = new Map();
    for (const row of walletRows) {
      const card = cardsByName.get(row.card_name);
      if (!card) continue;
      walletCardSlugs.push(card.slug);
      if (row.selections.length > 0) {
        userSelections.set(card.slug, row.selections);
      }
    }

    if (walletCardSlugs.length === 0) {
      return ok({ picks: [], store: { slug: store.slug, name: store.name } });
    }

    const picks = rankCards(store, allCards, {
      walletCardSlugs,
      userSelections,
      maxPicks,
    });

    return ok({
      picks,
      store: { slug: store.slug, name: store.name },
    });
  } catch (e) {
    console.error("wallet-picks-store failed:", e);
    return err(500, "Failed to compute wallet picks");
  }
};
