// Track engagement on the /best-card-for/{slug} store pages and return
// per-store counts for the admin dashboard.
//
// Two legacy event types share one aggregate table (store_page_events):
//   'visit'           — a page view (fired once per client on mount)
//   'affiliate_click' — an outbound click on the store's affiliate CTA
// Affiliate experiment assignment views and attributed clicks are also stored
// in store_affiliate_experiment_events.
//
// POST is public (anonymous visitors fire the beacons). GET is admin-only —
// it exposes traffic/conversion analytics, so it is gated the same way the
// admin.js endpoints are (Firebase custom claim `admin`, or a fallback UID).
const mysql = require("../db");
const storesData = require("../lib/ranker/stores.json");

// The generated ranker data is already bundled with the API and includes the
// affiliate config merged by build-stores.js. Return only a boolean to the
// dashboard rather than making the client download the full store catalog.
const affiliateStoreSlugs = new Set(
  (storesData.stores || []).filter((store) => store.affiliate).map((store) => store.slug)
);

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
