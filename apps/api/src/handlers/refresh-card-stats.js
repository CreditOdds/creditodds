// Recomputes per-card stats and upserts them into the card_stats table.
// Triggered by EventBridge on a schedule. Invoke-only — there is no public
// HTTP route (a manual recompute is `aws lambda invoke`). The httpMethod
// branches below are inert defensive handling, kept in case of direct invoke.

const mysql = require("../db");

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
};

// One query computes totals + all three medians for every card in a single pass.
// Per-card window functions via PARTITION BY — no N+1 loop.
function refreshSql(includeSampleCounts) {
  return `
  INSERT INTO card_stats (
    card_id,
    total_records,
    approved_count,
    rejected_count,
    approved_median_credit_score,
    approved_median_income,
    approved_median_length_credit,
    ${includeSampleCounts ? `approved_credit_score_count,
    approved_income_count,
    approved_length_credit_count,
    latest_approved_application,` : ''}
    updated_at
  )
  WITH totals AS (
    SELECT
      c.card_id,
      COUNT(r.record_id) AS total_records,
      SUM(CASE WHEN r.result = 1 THEN 1 ELSE 0 END) AS approved_count,
      SUM(CASE WHEN r.result = 0 THEN 1 ELSE 0 END) AS rejected_count,
      MAX(CASE WHEN r.result = 1 THEN r.date_applied END) AS latest_approved_application
    FROM cards c
    LEFT JOIN records r ON r.card_id = c.card_id AND r.admin_review = 1 AND r.active = 1
    GROUP BY c.card_id
  ),
  ranked_score AS (
    SELECT
      card_id,
      credit_score AS val,
      ROW_NUMBER() OVER (PARTITION BY card_id ORDER BY credit_score) AS rn,
      COUNT(*) OVER (PARTITION BY card_id) AS cnt
    FROM records
    WHERE result = 1 AND admin_review = 1 AND active = 1 AND credit_score BETWEEN 300 AND 850
  ),
  median_score AS (
    SELECT card_id, ROUND(AVG(val)) AS median_val, MAX(cnt) AS sample_count
    FROM ranked_score
    WHERE rn IN (FLOOR((cnt + 1) / 2), CEIL((cnt + 1) / 2))
    GROUP BY card_id
  ),
  ranked_income AS (
    SELECT
      card_id,
      listed_income AS val,
      ROW_NUMBER() OVER (PARTITION BY card_id ORDER BY listed_income) AS rn,
      COUNT(*) OVER (PARTITION BY card_id) AS cnt
    FROM records
    WHERE result = 1 AND admin_review = 1 AND active = 1 AND listed_income >= 0
  ),
  median_income AS (
    SELECT card_id, ROUND(AVG(val)) AS median_val, MAX(cnt) AS sample_count
    FROM ranked_income
    WHERE rn IN (FLOOR((cnt + 1) / 2), CEIL((cnt + 1) / 2))
    GROUP BY card_id
  ),
  ranked_length AS (
    SELECT
      card_id,
      length_credit AS val,
      ROW_NUMBER() OVER (PARTITION BY card_id ORDER BY length_credit) AS rn,
      COUNT(*) OVER (PARTITION BY card_id) AS cnt
    FROM records
    WHERE result = 1 AND admin_review = 1 AND active = 1 AND length_credit BETWEEN 0 AND 100
  ),
  median_length AS (
    SELECT card_id, ROUND(AVG(val)) AS median_val, MAX(cnt) AS sample_count
    FROM ranked_length
    WHERE rn IN (FLOOR((cnt + 1) / 2), CEIL((cnt + 1) / 2))
    GROUP BY card_id
  )
  SELECT
    t.card_id,
    t.total_records,
    t.approved_count,
    t.rejected_count,
    ms.median_val,
    mi.median_val,
    ml.median_val,
    ${includeSampleCounts ? `COALESCE(ms.sample_count, 0),
    COALESCE(mi.sample_count, 0),
    COALESCE(ml.sample_count, 0),
    t.latest_approved_application,` : ''}
    CURRENT_TIMESTAMP
  FROM totals t
  LEFT JOIN median_score  ms ON ms.card_id = t.card_id
  LEFT JOIN median_income mi ON mi.card_id = t.card_id
  LEFT JOIN median_length ml ON ml.card_id = t.card_id
  ON DUPLICATE KEY UPDATE
    total_records = VALUES(total_records),
    approved_count = VALUES(approved_count),
    rejected_count = VALUES(rejected_count),
    approved_median_credit_score = VALUES(approved_median_credit_score),
    approved_median_income = VALUES(approved_median_income),
    approved_median_length_credit = VALUES(approved_median_length_credit),
    ${includeSampleCounts ? `approved_credit_score_count = VALUES(approved_credit_score_count),
    approved_income_count = VALUES(approved_income_count),
    approved_length_credit_count = VALUES(approved_length_credit_count),
    latest_approved_application = VALUES(latest_approved_application),` : ''}
    updated_at = VALUES(updated_at)
`;
}

async function refresh() {
  const started = Date.now();
  let result;
  let sampleCountsAvailable = true;
  try {
    result = await mysql.query(refreshSql(true));
  } catch (error) {
    // Main deploys automatically, while additive DB migrations are manual.
    // An unknown insert column fails before writing anything. Keep existing
    // statistics fresh until migration 058 lands, then automatically adopt
    // the new columns on the next invocation (no warm-instance schema cache).
    const missingSampleColumn = error.code === 'ER_BAD_FIELD_ERROR' &&
      /'(approved_credit_score_count|approved_income_count|approved_length_credit_count|latest_approved_application)'/.test(error.sqlMessage || error.message || '');
    if (!missingSampleColumn) throw error;
    console.warn('Migration 058 pending; refreshing statistics without sample counts');
    sampleCountsAvailable = false;
    result = await mysql.query(refreshSql(false));
  }
  await mysql.end();
  return {
    affectedRows: result.affectedRows,
    sampleCountsAvailable,
    durationMs: Date.now() - started,
  };
}

exports.RefreshCardStatsHandler = async (event) => {
  // HTTP OPTIONS preflight
  if (event && event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: responseHeaders, body: "" };
  }

  try {
    const stats = await refresh();
    console.info("refresh-card-stats succeeded", stats);

    // Scheduled invocations (EventBridge) don't have httpMethod — return raw object.
    if (!event || !event.httpMethod) {
      return { ok: true, ...stats };
    }

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ ok: true, ...stats }),
    };
  } catch (error) {
    console.error("refresh-card-stats failed:", error);
    await mysql.end().catch(() => {});

    if (!event || !event.httpMethod) {
      throw error;
    }

    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ ok: false, error: error.message }),
    };
  }
};
