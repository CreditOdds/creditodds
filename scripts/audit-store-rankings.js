#!/usr/bin/env node
//
// audit-store-rankings.js — run the production store ranker over every store
// page and audit the results. Two jobs:
//
//   1. REPORT: run rankCards() over all stores, dedupe every category-match
//      reward that surfaces in any top-10, and print each one (card, reason,
//      note, effective rate, how many stores it hits + sample stores), sorted
//      by effective rate. This is the lens for catching a merchant-limited
//      rate polluting generic category pages — a "5x transit" that is really
//      Lyft-only will show up hitting 30 transit stores instead of 1.
//
//   2. VALIDATE: cross-check the data that the ranker trusts —
//        - every merchant_gate slug must be a real store
//        - a gated reward's category must be one of the gate-target store's
//          categories (else the gate is dead: it can never surface anywhere)
//        - every co_brand_cards / also_earns slug must be a real card
//      Exits 1 if any validation fails, so it can gate a build or CI run.
//
// This is the permanent version of the throwaway harness written during the
// PR #1701 review, which caught the Lyft / Aeroplan / AT&T / Atmos dead-gate
// and generic-category pollution bugs plus the phone-category taxonomy drift.
//
// Run: node scripts/audit-store-rankings.js
//   --validate-only   skip the report, run validation only (for CI/build)

const path = require("path");

const CARDS_FILE = path.join(__dirname, "..", "data", "cards.json");
const STORES_FILE = path.join(
  __dirname,
  "..",
  "apps",
  "api",
  "src",
  "lib",
  "ranker",
  "stores.json"
);
const { rankCards } = require(path.join(
  __dirname,
  "..",
  "apps",
  "api",
  "src",
  "lib",
  "ranker",
  "storeRanking.js"
));

const TOP_N = 10;
const SAMPLE_LIMIT = 6;

function loadCards() {
  const data = require(CARDS_FILE);
  return data.cards || data;
}

function loadStores() {
  const data = require(STORES_FILE);
  return data.stores || data;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(cards, stores) {
  const cardSlugs = new Set(cards.map((c) => c.slug));
  const storesBySlug = new Map(stores.map((s) => [s.slug, s]));
  const errors = [];

  for (const card of cards) {
    for (const r of card.rewards || []) {
      if (!r.merchant_gate || r.merchant_gate.length === 0) continue;
      for (const gateSlug of r.merchant_gate) {
        const store = storesBySlug.get(gateSlug);
        if (!store) {
          errors.push(
            `${card.slug}: merchant_gate references "${gateSlug}", which is not a store slug`
          );
          continue;
        }
        // A gate is only useful if the gated reward's category is one the
        // target store actually carries — otherwise the reward can never
        // match there and the rate is silently unreachable everywhere.
        if (!(store.categories || []).includes(r.category)) {
          errors.push(
            `${card.slug}: reward "${r.category}" is gated to "${gateSlug}", ` +
              `but that store's categories are [${(store.categories || []).join(", ")}] ` +
              `— the gate is dead, this reward can never surface`
          );
        }
      }
    }
  }

  for (const store of stores) {
    for (const slug of store.co_brand_cards || []) {
      if (!cardSlugs.has(slug)) {
        errors.push(
          `store ${store.slug}: co_brand_cards references "${slug}", which is not a card slug`
        );
      }
    }
    for (const entry of store.also_earns || []) {
      if (!cardSlugs.has(entry.card)) {
        errors.push(
          `store ${store.slug}: also_earns references "${entry.card}", which is not a card slug`
        );
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function buildReport(cards, stores) {
  // Dedupe every category-source pick that lands in a top-10, keyed by the
  // card + the human reason + note (which together identify the underlying
  // reward). Track effective rate and which stores it surfaces on.
  const rewards = new Map();

  for (const store of stores) {
    const picks = rankCards(store, cards, { maxPicks: TOP_N });
    for (const pick of picks) {
      if (pick.source !== "category") continue;
      const key = `${pick.card.slug}||${pick.reason}||${pick.note || ""}`;
      let entry = rewards.get(key);
      if (!entry) {
        entry = {
          card: pick.card.card_name || pick.card.slug,
          slug: pick.card.slug,
          reason: pick.reason,
          note: pick.note || "",
          effectiveRate: pick.effectiveRate,
          stores: [],
        };
        rewards.set(key, entry);
      }
      entry.stores.push(store.name);
    }
  }

  return [...rewards.values()].sort(
    (a, b) => b.effectiveRate - a.effectiveRate
  );
}

function printReport(report) {
  console.log(
    `Category-match rewards surfacing in any top-${TOP_N} (deduped, ${report.length} total)`
  );
  console.log("Sorted by effective rate. High store counts on a generic");
  console.log("category are the smell for a merchant-limited rate.\n");

  for (const r of report) {
    const rate = r.effectiveRate.toFixed(2).replace(/\.00$/, "");
    const samples = r.stores.slice(0, SAMPLE_LIMIT).join(", ");
    const more =
      r.stores.length > SAMPLE_LIMIT
        ? `, +${r.stores.length - SAMPLE_LIMIT} more`
        : "";
    console.log(`${rate}% ${r.card}`);
    console.log(`  reason: ${r.reason}`);
    if (r.note) console.log(`  note:   ${r.note}`);
    console.log(`  stores: ${r.stores.length} (${samples}${more})`);
    console.log("");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const validateOnly = process.argv.includes("--validate-only");
  const cards = loadCards();
  const stores = loadStores();

  if (!validateOnly) {
    const report = buildReport(cards, stores);
    printReport(report);
  }

  const errors = validate(cards, stores);
  if (errors.length > 0) {
    console.error(`\nVALIDATION FAILED — ${errors.length} error(s):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  console.log(
    `Validation passed: ${cards.length} cards, ${stores.length} stores, ` +
      `all merchant_gate / co_brand_cards / also_earns references resolve.`
  );
}

main();
