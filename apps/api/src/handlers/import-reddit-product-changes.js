// Imports human-approved Reddit product-change reports into
// reddit_product_changes. Invoke-only (no HTTP route):
// .github/workflows/sync-product-changes.yml calls this with the full contents
// of data/reddit-product-changes/ after a merge to main.
//
// Deliberately mirrors import-reddit-records.js: same trigger contract, same
// suffix-fuzzy card lookup, same "send the whole directory, skip what exists"
// idempotency. The differences are the target table and that a row here is an
// EDGE (two cards) rather than an outcome.
const mysql = require("../db");
const yup = require("yup");

// Why the cardholder moved. 'forced' means the issuer initiated it (a product
// being discontinued, an account converted without asking); 'voluntary' means
// the cardholder asked. Unstated is the common case and stays null rather than
// defaulting, because guessing would distort the forced-vs-voluntary read that
// makes an outbound edge interesting.
const CHANGE_REASONS = ["voluntary", "forced"];

const importSchema = yup.object().shape({
  // The #N suffix lets one post contribute several hops
  // ("AA Plat -> Mile Up -> Custom Cash" is two rows, #1 and #2).
  source_id: yup.string().matches(/^t[13]_[a-z0-9]+(#\d+)?$/).required(),
  from_card: yup.string().max(254).required(),
  to_card: yup.string().max(254).required(),
  change_month: yup.string().matches(/^\d{4}-(0[1-9]|1[0-2])$/).required(),
  reason: yup.string().oneOf([...CHANGE_REASONS, null]).nullable(),
  evidence: yup.string().max(500).nullable(),
  permalink: yup.string().max(500).nullable(),
});

// Same suffix-fuzzy card_name matching the sync-cards Lambda uses — the DB may
// still hold pre-standardization " Card"/" Credit Card" suffixes.
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

exports.ImportRedditProductChangesHandler = async (event) => {
  console.info("received:", JSON.stringify({ source: event?.source, changes: event?.changes?.length }));

  if (event?.source !== "github-action" && event?.source !== "manual") {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Unrecognized trigger; pass {source: 'github-action'|'manual'}" }),
    };
  }
  const changes = Array.isArray(event.changes) ? event.changes : [];
  if (changes.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "No changes in payload", imported: 0, skipped: 0, errors: [] }),
    };
  }

  const results = { imported: [], skipped: [], errors: [] };

  try {
    const cards = await mysql.query("SELECT card_id, card_name FROM cards");
    const findCard = buildCardLookup(cards);

    const existing = await mysql.query("SELECT source_id FROM reddit_product_changes");
    const existingIds = new Set(existing.map((r) => r.source_id));

    const currentMonth = new Date().toISOString().slice(0, 7);

    for (const raw of changes) {
      const label = raw?.source_id || "(no source_id)";
      try {
        const value = await importSchema.validate(raw, { stripUnknown: true });

        if (existingIds.has(value.source_id)) {
          results.skipped.push(value.source_id);
          continue;
        }
        if (value.change_month > currentMonth) {
          throw new Error("change_month is in the future");
        }

        const from = findCard(value.from_card);
        if (!from) throw new Error(`from_card "${value.from_card}" not found in cards table`);
        const to = findCard(value.to_card);
        if (!to) throw new Error(`to_card "${value.to_card}" not found in cards table`);
        if (from.card_id === to.card_id) {
          throw new Error("from_card and to_card resolve to the same card");
        }

        await mysql.query("INSERT INTO reddit_product_changes SET ?", {
          source_id: value.source_id,
          old_card_id: from.card_id,
          new_card_id: to.card_id,
          change_month: new Date(`${value.change_month}-01T00:00:00Z`),
          reason: value.reason ?? null,
          evidence: value.evidence ?? null,
          permalink: value.permalink ?? null,
        });
        existingIds.add(value.source_id);
        results.imported.push(value.source_id);
      } catch (changeError) {
        console.error(`Error importing ${label}:`, changeError.message);
        results.errors.push({ source_id: label, error: changeError.message });
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
        message: "Reddit product changes imported",
        imported: results.imported.length,
        skipped: results.skipped.length,
        errors: results.errors,
      }),
    };
  } catch (error) {
    console.error("Error importing reddit product changes:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error importing reddit product changes", error: error.message }),
    };
  }
};
