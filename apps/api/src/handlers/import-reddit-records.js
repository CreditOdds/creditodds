// Imports human-approved Reddit data points into the records table.
// Invoke-only (no HTTP route): .github/workflows/sync-datapoints.yml calls
// this Lambda with the full contents of data/reddit-datapoints/ after a
// merge to main. Rows land with submitter_id "reddit:<source_id>", which
// makes imports distinguishable from site submissions, idempotent (existing
// source_ids are skipped), and excludable (the leaderboard filters the
// reddit: prefix out).
const mysql = require("../db");
const yup = require("yup");

// Mirrors REASON_DENIED_CODES in user-records.js.
const REASON_DENIED_CODES = [
  "too_many_inquiries",
  "too_many_recent_accounts",
  "length_of_credit_too_short",
  "credit_score_too_low",
  "high_utilization",
  "too_much_credit_with_issuer",
  "income_too_low",
  "recent_delinquency",
  "bankruptcy_or_public_record",
  "other",
  "not_specified",
];

// Field ranges mirror the user-facing recordSchema in user-records.js; the
// differences are the review-pipeline fields (source_id, card_name instead of
// card_id, result as a word, date_applied as "YYYY-MM") and bank_customer
// being optional — Reddit posts rarely state an issuer relationship.
const importSchema = yup.object().shape({
  source_id: yup.string().matches(/^t[13]_[a-z0-9]+(#\d+)?$/).required(),
  card_name: yup.string().max(254).required(),
  result: yup.string().oneOf(["approved", "denied"]).required(),
  credit_score: yup.number().integer().min(300).max(850).required(),
  credit_score_source: yup.number().integer().min(0).max(4).required(),
  listed_income: yup.number().integer().min(0).max(1000000).nullable(),
  length_credit: yup.number().integer().min(0).max(100).nullable(),
  starting_credit_limit: yup.number().integer().min(0).max(1000000).nullable(),
  total_open_cards: yup.number().integer().min(0).max(500).nullable(),
  inquiries_3: yup.number().integer().min(0).max(50).nullable(),
  inquiries_12: yup.number().integer().min(0).max(50).nullable(),
  inquiries_24: yup.number().integer().min(0).max(50).nullable(),
  bank_customer: yup.boolean().nullable(),
  date_applied: yup.string().matches(/^\d{4}-(0[1-9]|1[0-2])$/).required(),
  reason_denied: yup.string().max(254).nullable(),
  reason_denied_code: yup.string().oneOf([...REASON_DENIED_CODES, null]).nullable(),
});

// Same suffix-fuzzy card_name matching the sync-cards Lambda uses — the DB
// may still hold pre-standardization " Card"/" Credit Card" suffixes.
function buildCardLookup(cards) {
  const byName = new Map(cards.map((c) => [c.card_name, c]));
  return function findCard(name) {
    if (byName.has(name)) return byName.get(name);
    const suffixes = [" Card", " Credit Card", " card", " credit card"];
    for (const suffix of suffixes) {
      if (byName.has(name + suffix)) return byName.get(name + suffix);
      if (name.endsWith(suffix) && byName.has(name.slice(0, -suffix.length))) {
        return byName.get(name.slice(0, -suffix.length));
      }
    }
    return null;
  };
}

exports.ImportRedditRecordsHandler = async (event) => {
  console.info("received:", JSON.stringify({ source: event?.source, records: event?.records?.length }));

  if (event?.source !== "github-action" && event?.source !== "manual") {
    return { statusCode: 400, body: JSON.stringify({ message: "Unrecognized trigger; pass {source: 'github-action'|'manual'}" }) };
  }
  const records = Array.isArray(event.records) ? event.records : [];
  if (records.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ message: "No records in payload", imported: 0, skipped: 0, errors: [] }) };
  }

  const results = { imported: [], skipped: [], errors: [] };

  try {
    const cards = await mysql.query("SELECT card_id, card_name FROM cards");
    const findCard = buildCardLookup(cards);

    const existing = await mysql.query(
      "SELECT submitter_id FROM records WHERE submitter_id LIKE 'reddit:%'"
    );
    const existingIds = new Set(existing.map((r) => r.submitter_id));

    const currentMonth = new Date().toISOString().slice(0, 7);

    for (const raw of records) {
      const label = raw?.source_id || "(no source_id)";
      try {
        const value = await importSchema.validate(raw, { stripUnknown: true });

        const submitterId = `reddit:${value.source_id}`;
        if (existingIds.has(submitterId)) {
          results.skipped.push(value.source_id);
          continue;
        }
        if (value.date_applied > currentMonth) {
          throw new Error("date_applied is in the future");
        }
        const card = findCard(value.card_name);
        if (!card) {
          throw new Error(`card_name "${value.card_name}" not found in cards table`);
        }

        const approved = value.result === "approved";
        await mysql.query("INSERT INTO records SET ?", {
          card_id: card.card_id,
          result: approved ? 1 : 0,
          credit_score: value.credit_score,
          credit_score_source: value.credit_score_source,
          listed_income: value.listed_income ?? null,
          date_applied: new Date(`${value.date_applied}-01T00:00:00Z`),
          length_credit: value.length_credit ?? null,
          starting_credit_limit: approved ? value.starting_credit_limit ?? null : null,
          submitter_id: submitterId,
          submitter_ip_address: null,
          submit_datetime: new Date(),
          // Unknown issuer relationship records as 0 — the column predates the
          // migrations folder and every existing row carries an explicit 0/1
          // from the site form's required toggle. A nullable-column migration
          // is the cleaner fix if this ever matters analytically.
          bank_customer: value.bank_customer == null ? 0 : value.bank_customer ? 1 : 0,
          reason_denied: approved ? null : value.reason_denied ?? null,
          reason_denied_code: approved ? null : value.reason_denied_code ?? null,
          total_open_cards: value.total_open_cards ?? null,
          inquiries_3: value.inquiries_3 ?? null,
          inquiries_12: value.inquiries_12 ?? null,
          inquiries_24: value.inquiries_24 ?? null,
          admin_review: 1,
        });
        existingIds.add(submitterId);
        results.imported.push(value.source_id);
      } catch (recordError) {
        console.error(`Error importing ${label}:`, recordError.message);
        results.errors.push({ source_id: label, error: recordError.message });
      }
    }

    await mysql.end();

    console.log("Import results:", JSON.stringify({
      imported: results.imported.length,
      skipped: results.skipped.length,
      errors: results.errors,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Reddit data points imported",
        imported: results.imported.length,
        skipped: results.skipped.length,
        errors: results.errors,
      }),
    };
  } catch (error) {
    console.error("Error importing reddit records:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error importing reddit records", error: error.message }),
    };
  }
};
