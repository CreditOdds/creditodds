// Unit tests for the shared store ranker (storeRanking.js) and the
// valuation matcher it depends on. Written alongside the 2026-07 audit of
// /best-card-for — each block guards a bug that was live on the site:
//   - co-brand picks rendered in YAML order (weakest card at #1)
//   - flat-rate cards appended after every category pick regardless of rate
//   - co-brand Amex partner cards ("Marriott Bonvoy ... American Express")
//     valued as Membership Rewards at 1.2cpp instead of the partner currency

const { rankCards } = require("../src/lib/ranker/storeRanking");
const { getValuation, getValuationDetails } = require("../src/lib/ranker/valuations");

function card(slug, rewards, overrides) {
  return {
    slug,
    card_name: slug,
    accepting_applications: true,
    rewards,
    ...overrides,
  };
}

const pct = (category, value, extra) => ({ category, value, unit: "percent", ...extra });

describe("valuation program matching", () => {
  test.each([
    ["American Express Gold", 1.2],
    ["The Platinum Card", 1.2],
    // Partner co-brands issued by Amex must NOT be priced as MR.
    ["Marriott Bonvoy Brilliant American Express", 0.7],
    ["Marriott Bonvoy Bevy American Express", 0.7],
    ["Hilton Honors American Express Aspire", 0.5],
    ["Delta SkyMiles Platinum American Express", 1.2], // SkyMiles' own 1.2, not MR's
    ["Navy Federal More Rewards American Express", 1.0],
    ["Wells Fargo Propel American Express", 1.0],
    // Ink Business Preferred earns transferable UR like the Sapphires.
    ["Ink Business Preferred", 1.25],
    ["Chase Sapphire Preferred", 1.25],
  ])("%s → %scpp", (name, cpp) => {
    expect(getValuation(name)).toBe(cpp);
  });

  test("Delta co-brand resolves to the SkyMiles program, not MR", () => {
    expect(getValuationDetails("Delta SkyMiles Platinum American Express").program).toBe(
      "Delta SkyMiles",
    );
  });
});

describe("co-brand ordering", () => {
  const store = {
    name: "United Airlines",
    slug: "united-airlines",
    categories: ["airlines", "travel"],
    co_brand_cards: ["gateway", "explorer", "infinite"],
  };
  // YAML order is ascending by fee; the page must lead with the best earner.
  const cards = [
    card("gateway", [pct("airlines", 1), pct("everything_else", 1)]),
    card("explorer", [pct("airlines", 2), pct("everything_else", 1)]),
    card("infinite", [pct("airlines", 4), pct("everything_else", 1)]),
  ];

  test("co-brand picks sort by effective rate, not YAML order", () => {
    const picks = rankCards(store, cards);
    expect(picks.map((p) => p.card.slug)).toEqual(["infinite", "explorer", "gateway"]);
    expect(picks.every((p) => p.source === "co_brand")).toBe(true);
  });

  test("a lower-% co-brand does not outrank higher-% general cards", () => {
    const general = card("premium-travel", [
      pct("airlines", 5),
      pct("everything_else", 1),
    ]);
    const flat = card("flat-3", [pct("everything_else", 3)]);
    const picks = rankCards(store, [...cards, general, flat]);
    expect(picks.map((p) => p.card.slug)).toEqual([
      "premium-travel", // 5% category
      "infinite",       // 4% co-brand
      "flat-3",         // 3% flat
      "explorer",       // 2% co-brand
      "gateway",        // 1% co-brand
    ]);
  });

  test("at an exact rate tie the co-brand leads", () => {
    const tied = card("tied-general", [pct("airlines", 4), pct("everything_else", 1)]);
    const picks = rankCards(store, [...cards, tied]);
    expect(picks[0].card.slug).toBe("infinite");
    expect(picks[0].source).toBe("co_brand");
    expect(picks[1].card.slug).toBe("tied-general");
  });
});

describe("flat-rate cards compete on effective rate", () => {
  const store = { name: "Shop", slug: "shop", categories: ["online_shopping"] };
  const cards = [
    // 4x at 0.5cpp = 2% effective category match…
    card("weak-points", [
      { category: "online_shopping", value: 4, unit: "points_per_dollar" },
    ], { card_name: "Hilton Honors Surpass Test" }),
    // …must NOT outrank a 3% flat-rate card.
    card("strong-flat", [pct("everything_else", 3)]),
    card("mid-category", [pct("online_shopping", 2.5), pct("everything_else", 1)]),
  ];

  test("3% flat ranks above a 2%-effective category bonus", () => {
    const picks = rankCards(store, cards);
    expect(picks.map((p) => p.card.slug)).toEqual([
      "strong-flat",
      "mid-category",
      "weak-points",
    ]);
    expect(picks[0].source).toBe("flat_rate");
  });

  test("situational rotating picks still sort below flat-rate cards", () => {
    const rotating = card("rotator", [
      {
        category: "rotating",
        value: 5,
        unit: "percent",
        mode: "quarterly_rotating",
        current_categories: ["gas"],
        eligible_categories: ["online_shopping"],
      },
      pct("everything_else", 1),
    ]);
    const picks = rankCards(store, [...cards, rotating]);
    const slugs = picks.map((p) => p.card.slug);
    expect(slugs.indexOf("rotator")).toBeGreaterThan(slugs.indexOf("strong-flat"));
    expect(picks.find((p) => p.card.slug === "rotator").matchMode).toBe("rotating_eligible");
  });
});

describe("merchant_gate", () => {
  const gated = card("atmos-like", [
    {
      category: "airlines",
      value: 5,
      unit: "percent",
      merchant_gate: ["alaska-airlines"],
    },
    pct("everything_else", 1),
  ]);
  const alaska = { name: "Alaska", slug: "alaska-airlines", categories: ["airlines"] };
  const delta = { name: "Delta", slug: "delta-air-lines", categories: ["airlines"] };

  test("gated reward surfaces only at its gate target", () => {
    const atAlaska = rankCards(alaska, [gated]);
    expect(atAlaska).toHaveLength(1);
    expect(atAlaska[0].rate).toBe(5);
    expect(atAlaska[0].source).toBe("category");

    const atDelta = rankCards(delta, [gated]);
    // Only the 1% everything_else remains, and it is below the 2% fill floor.
    expect(atDelta).toHaveLength(0);
  });
});

describe("also_earns and rotating_current", () => {
  test("also_earns entry dedupes the card out of category matching", () => {
    const store = {
      name: "Whole Foods",
      slug: "whole-foods-market",
      categories: ["groceries"],
      also_earns: [{ card: "prime-like", rate: 5, unit: "percent" }],
    };
    const cards = [card("prime-like", [pct("groceries", 1), pct("everything_else", 1)])];
    const picks = rankCards(store, cards);
    expect(picks).toHaveLength(1);
    expect(picks[0].source).toBe("also_earns");
    expect(picks[0].rate).toBe(5);
  });

  test("current-quarter rotating category matches as rotating_current", () => {
    const store = { name: "Shell", slug: "shell", categories: ["gas"] };
    const rotating = card("flex-like", [
      {
        category: "rotating",
        value: 5,
        unit: "percent",
        mode: "quarterly_rotating",
        current_categories: ["gas", "airlines"],
        current_period: "Q3 2026",
      },
      pct("everything_else", 1),
    ]);
    const picks = rankCards(store, [rotating]);
    expect(picks[0].matchMode).toBe("rotating_current");
    expect(picks[0].rate).toBe(5);
  });
});
