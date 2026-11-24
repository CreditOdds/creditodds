// Track engagement on the /best-card-for/{slug} store pages and return
// per-store counts for the admin dashboard.
//
// Two legacy event types share one aggregate table (store_page_events):
//   'visit'           — a page view (fired once per client on mount)
//   'affiliate_click' — an outbound click on the store's affiliate CTA
// Affiliate experiment assignment views and attributed clicks are also stored
// in store_affiliate_experiment_events.
//
// POST is public (anonymous visitors fire the beacons). GET /store-event is
// admin-only: it exposes traffic/conversion analytics, so it is gated the same
// way the admin.js endpoints are (Firebase custom claim `admin`, or a fallback
// UID). GET /store-event/top is public but deliberately narrow: visit counts
// for the top N known stores plus last week's rank, nothing about clicks or
// affiliate status. It feeds the weekly "most viewed stores" social post.
const mysql = require("../db");
const storesData = require("../lib/ranker/stores.json");

// The generated ranker data is already bundled with the API and includes the
// affiliate config merged by build-stores.js. Return only a boolean to the
// dashboard rather than making the client download the full store catalog.
const affiliateStoreSlugs = new Set(
  (storesData.stores || []).filter((store) => store.affiliate).map((store) => store.slug)
);

// store_slug arrives from an unauthenticated beacon, so the table can hold
// slugs that are not real stores. The public top list only ranks slugs that
// exist in the catalog and reports the catalog's display name.
const storeNameBySlug = new Map(
  (storesData.stores || []).map((store) => [store.slug, store.name])
);

const TOP_STORES_DEFAULT_LIMIT = 7;
const TOP_STORES_MAX_LIMIT = 25;

// Ranks known stores by visits; ties break by slug so the order is stable.
function rankBy(rows, key) {
  return rows
    .filter((r) => r[key] > 0)
    .sort((a, b) => b[key] - a[key] || a.slug.localeCompare(b.slug));
}

// Top N stores by visits over the same window the admin tab's "7d" uses
// (event_date >= CURDATE() - 7), plus each store's rank over the 7 days
// before that, so callers can show week-over-week movement.
async function getTopStores(limit) {
  const rows = await mysql.query(
    `SELECT store_slug,
            SUM(CASE WHEN event_date >= CURDATE() - INTERVAL 7 DAY THEN event_count ELSE 0 END) AS visits,
            SUM(CASE WHEN event_date <  CURDATE() - INTERVAL 7 DAY THEN event_count ELSE 0 END) AS previous_visits
     FROM store_page_events
     WHERE event_type = 'visit'
       AND event_date >= CURDATE() - INTERVAL 14 DAY
     GROUP BY store_slug`
  );

  const known = rows
    .filter((r) => storeNameBySlug.has(r.store_slug))
    .map((r) => ({
      slug: r.store_slug,
      visits: Number(r.visits) || 0,
      previous_visits: Number(r.previous_visits) || 0,
    }));

  const previousRank = new Map();
  rankBy(known, 'previous_visits').forEach((r, i) => previousRank.set(r.slug, i + 1));

  return rankBy(known, 'visits')
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1,
      slug: r.slug,
      name: storeNameBySlug.get(r.slug),
      visits: r.visits,
      previous_rank: previousRank.get(r.slug) || null,
    }));
}

// Keep in sync with FALLBACK_ADMIN_IDS / isAdmin in src/handlers/admin.js.
const FALLBACK_ADMIN_IDS = ['zXOyHmGl7HStyAqEdLsgXLA5inS2'];

function isAdmin(event) {
  const userId = event.requestContext?.authorizer?.sub;
  const adminClaim = event.requestContext?.authorizer?.admin;
  if (adminClaim === 'true') return true;
  return FALLBACK_ADMIN_IDS.includes(userId);
}

const responseHeaders = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
  "X-Requested-With": "*",
};

const VALID_TYPES = ["visit", "affiliate_click", "affiliate_impression"];
const AFFILIATE_EXPERIMENT_ID = "affiliate-cta-v1";
const VALID_EXPERIMENT_VARIANTS = new Set([
  "control",
  "checkout_plan",
  "reward_calculator",
  "sticky_bar",
]);
const VALID_EXPERIMENT_PLACEMENTS = new Set([
  "assigned",
  "top",
  "after_first",
  "after_picks",
  "sticky",
]);

// Self-heal: if 048_create_store_page_events.sql hasn't been applied yet, the
// table won't exist and every write/read would 500. Create-if-missing matches
// that migration's schema so tracking works without the migration dance.
const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS store_page_events (
    event_type VARCHAR(24) NOT NULL,
    store_slug VARCHAR(191) NOT NULL,
    event_date DATE NOT NULL,
    event_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (event_type, store_slug, event_date),
    INDEX idx_store_event_date (event_date)
  )
`;

const ENSURE_EXPERIMENT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS store_affiliate_experiment_events (
    event_type VARCHAR(16) NOT NULL,
    experiment_id VARCHAR(64) NOT NULL,
    variant VARCHAR(32) NOT NULL,
    placement VARCHAR(32) NOT NULL,
    store_slug VARCHAR(191) NOT NULL,
    event_date DATE NOT NULL,
    event_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (event_type, experiment_id, variant, placement, store_slug, event_date),
    INDEX idx_store_affiliate_experiment_date (experiment_id, event_date)
  )
`;

let tableEnsured = false;
let experimentTableEnsured = false;
async function ensureTable() {
  if (tableEnsured) return;
  await mysql.query(ENSURE_TABLE_SQL);
  tableEnsured = true;
}

async function ensureExperimentTable() {
  if (experimentTableEnsured) return;
  await mysql.query(ENSURE_EXPERIMENT_TABLE_SQL);
  experimentTableEnsured = true;
}

exports.StoreEventHandler = async (event) => {
  console.info("received:", event.httpMethod, event.path);

  let response = {};

  switch (event.httpMethod) {
    case "OPTIONS":
      response = {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({ statusText: "OK" }),
      };
      break;

    case "POST":
      try {
        const body = JSON.parse(event.body);
        const { event_type, store_slug, experiment_id, variant, placement } = body;

        if (!VALID_TYPES.includes(event_type)) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({
              error: "event_type must be 'visit', 'affiliate_click', or 'affiliate_impression'",
            }),
          };
          break;
        }
        if (typeof store_slug !== "string" || !store_slug || store_slug.length > 191) {
          response = {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: "store_slug must be a non-empty string (<=191 chars)" }),
          };
          break;
        }

        const hasExperimentMetadata = experiment_id !== undefined
          || variant !== undefined
          || placement !== undefined;
        if (event_type === "affiliate_impression" || hasExperimentMetadata) {
          if (
            experiment_id !== AFFILIATE_EXPERIMENT_ID
            || !VALID_EXPERIMENT_VARIANTS.has(variant)
            || !VALID_EXPERIMENT_PLACEMENTS.has(placement)
          ) {
            response = {
              statusCode: 400,
              headers: responseHeaders,
              body: JSON.stringify({ error: "invalid affiliate experiment metadata" }),
            };
            break;
          }
        }

        // Filter out obvious bots (mirrors content-view.js).
        const userAgent = event.headers?.['User-Agent'] || event.headers?.['user-agent'] || '';
        if (/bot|crawler|spider|scraper/i.test(userAgent)) {
          response = {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({ success: true }),
          };
          break;
        }

        if (event_type !== "affiliate_impression") {
          await ensureTable();
          await mysql.query(
            `INSERT INTO store_page_events (event_type, store_slug, event_date, event_count)
             VALUES (?, ?, CURDATE(), 1)
             ON DUPLICATE KEY UPDATE event_count = event_count + 1`,
            [event_type, store_slug]
          );
        }

        if (event_type === "affiliate_impression" || hasExperimentMetadata) {
          await ensureExperimentTable();
          await mysql.query(
            `INSERT INTO store_affiliate_experiment_events
               (event_type, experiment_id, variant, placement, store_slug, event_date, event_count)
             VALUES (?, ?, ?, ?, ?, CURDATE(), 1)
             ON DUPLICATE KEY UPDATE event_count = event_count + 1`,
            [
              event_type === "affiliate_impression" ? "view" : "click",
              experiment_id,
              variant,
              placement,
              store_slug,
            ]
          );
        }
        await mysql.end();

        response = {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({ success: true }),
        };
      } catch (error) {
        console.error("Error tracking store event:", error);
        response = {
          statusCode: 500,
          headers: responseHeaders,
          body: JSON.stringify({ error: "Failed to track store event" }),
        };
      }
      break;

    case "GET":
      // Public, visits-only leaderboard. Must be checked before the admin gate.
      if (event.resource === "/store-event/top") {
        try {
          const requested = parseInt(event.queryStringParameters?.limit, 10);
          const limit = Number.isFinite(requested)
            ? Math.min(Math.max(requested, 1), TOP_STORES_MAX_LIMIT)
            : TOP_STORES_DEFAULT_LIMIT;
          await ensureTable();
          const stores = await getTopStores(limit);
          await mysql.end();
          response = {
            statusCode: 200,
            headers: { ...responseHeaders, "Cache-Control": "public, max-age=300" },
            body: JSON.stringify({ period_days: 7, stores }),
          };
        } catch (error) {
          console.error("Error fetching top stores:", error);
          response = {
            statusCode: 500,
            headers: { ...responseHeaders, "Cache-Control": "no-store" },
            body: JSON.stringify({ error: "Failed to fetch top stores" }),
          };
        }
        break;
      }

      // Admin-only: traffic + conversion analytics.
      if (!isAdmin(event)) {
        response = {
          statusCode: 403,
          headers: { ...responseHeaders, "Cache-Control": "no-store" },
          body: JSON.stringify({ error: "Forbidden: Admin access required" }),
        };
        break;
      }
      try {
        const period = event.queryStringParameters?.period;
        const where = [];
        const params = [];
        // period in days; '0' (or absent) means all-time.
        if (period && period !== '0') {
          const days = Math.min(Math.max(parseInt(period, 10) || 30, 1), 365);
          where.push(`event_date >= CURDATE() - INTERVAL ? DAY`);
          params.push(days);
        }
        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        await ensureTable();
        await ensureExperimentTable();
        const rows = await mysql.query(
          `SELECT store_slug,
                  SUM(CASE WHEN event_type = 'visit' THEN event_count ELSE 0 END) AS visits,
                  SUM(CASE WHEN event_type = 'affiliate_click' THEN event_count ELSE 0 END) AS clicks
           FROM store_page_events
           ${whereSql}
           GROUP BY store_slug
           ORDER BY visits DESC`,
          params
        );

        const experimentParams = [AFFILIATE_EXPERIMENT_ID, ...params];
        const experimentWhereSql = where.length
          ? `AND ${where.join(" AND ")}`
          : "";
        const experimentRows = await mysql.query(
          `SELECT variant,
                  SUM(CASE WHEN event_type = 'view' THEN event_count ELSE 0 END) AS views,
                  SUM(CASE WHEN event_type = 'click' THEN event_count ELSE 0 END) AS clicks
           FROM store_affiliate_experiment_events
           WHERE experiment_id = ?
           ${experimentWhereSql}
           GROUP BY variant`,
          experimentParams
        );
        await mysql.end();

        const stores = rows.map((r) => ({
          slug: r.store_slug,
          visits: Number(r.visits) || 0,
          clicks: Number(r.clicks) || 0,
          hasAffiliate: affiliateStoreSlugs.has(r.store_slug),
        }));

        const affiliateExperiment = experimentRows.map((r) => ({
          variant: r.variant,
          views: Number(r.views) || 0,
          clicks: Number(r.clicks) || 0,
        }));

        response = {
          statusCode: 200,
          headers: { ...responseHeaders, "Cache-Control": "no-store" },
          body: JSON.stringify({ stores, affiliateExperiment }),
        };
      } catch (error) {
        console.error("Error fetching store event stats:", error);
        response = {
          statusCode: 500,
          headers: { ...responseHeaders, "Cache-Control": "no-store" },
          body: JSON.stringify({ error: "Failed to fetch store event stats" }),
        };
      }
      break;

    default:
      response = {
        statusCode: 405,
        headers: responseHeaders,
        body: `StoreEvent only accepts GET and POST methods, you tried: ${event.httpMethod}`,
      };
      break;
  }

  console.info(`response from: ${event.path} statusCode: ${response.statusCode}`);
  return response;
};
