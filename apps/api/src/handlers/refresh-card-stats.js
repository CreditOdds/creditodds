// Recomputes per-card stats and upserts them into the card_stats table.
// Triggered by EventBridge on a schedule; also callable via HTTP for ops use.

const mysql = require("serverless-mysql")({
  config: {
    host: process.env.ENDPOINT,
    database: process.env.DATABASE,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
  },
});

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
};

// One query computes totals + all three medians for every card in a single pass.
// Per-card window functions via PARTITION BY — no N+1 loop.
const REFRESH_SQL = `
  INSERT INTO card_stats (
    card_id,
    total_records,
    approved_count,
    rejected_count,
    approved_median_credit_score,
    approved_median_income,
    approved_median_length_credit
  )
  WITH totals AS (
    SELECT
      card_id,
      COUNT(*) AS total_records,
      SUM(CASE WHEN result = 1 THEN 1 ELSE 0 END) AS approved_count,
      SUM(CASE WHEN result = 0 THEN 1 ELSE 0 END) AS rejected_count
    FROM records
    WHERE admin_review = 1
    GROUP BY card_id
  ),
  ranked_score AS (
    SELECT
      card_id,
      credit_score AS val,
      ROW_NUMBER() OVER (PARTITION BY card_id ORDER BY credit_score) AS rn,
      COUNT(*) OVER (PARTITION BY card_id) AS cnt
    FROM records
    WHERE result = 1 AND admin_review = 1 AND credit_score IS NOT NULL
  ),
  median_score AS (
    SELECT card_id, ROUND(AVG(val)) AS median_val
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
    WHERE result = 1 AND admin_review = 1 AND listed_income IS NOT NULL
  ),
  median_income AS (
    SELECT card_id, ROUND(AVG(val)) AS median_val
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
    WHERE result = 1 AND admin_review = 1 AND length_credit IS NOT NULL
  ),
  median_length AS (
    SELECT card_id, ROUND(AVG(val)) AS median_val
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
    ml.median_val
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
    approved_median_length_credit = VALUES(approved_median_length_credit)
`;

async function refresh() {
  const started = Date.now();
  const result = await mysql.query(REFRESH_SQL);
  await mysql.end();
  return {
    affectedRows: result.affectedRows,
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
