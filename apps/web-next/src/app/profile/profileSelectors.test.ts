import { describe, expect, it } from "vitest";
import {
  createCardLookups,
  getEligibleRecordCards,
  getEligibleReferralCards,
  getRelevantNews,
  getTotalAnnualFees,
  getWalletVisibility,
  normalizeCardName,
} from "./profileSelectors";

describe("profileSelectors", () => {
  const allCards = [
    { card_id: 1, db_card_id: 101, card_name: "Chase Sapphire Preferred", annual_fee: 95, slug: "chase-sapphire-preferred", active: true },
    { card_id: 2, db_card_id: 202, card_name: "Old Card", annual_fee: 49, slug: "old-card", active: false },
  ] as const;

  const walletCards = [
    { card_id: 101, card_name: "Chase Sapphire Preferred" },
    { card_id: 202, card_name: "Old Card" },
  ] as const;

  const lookups = createCardLookups(allCards as never);

  it("calculates annual fees and inactive visibility from shared lookups", () => {
    expect(getTotalAnnualFees(walletCards as never, lookups)).toBe(144);
    expect(getWalletVisibility(walletCards as never, lookups, false)).toEqual({
      activeWalletCards: [{ card_id: 101, card_name: "Chase Sapphire Preferred" }],
      inactiveCount: 1,
    });
  });

  it("filters record candidates and relevant news by owned-card slugs", () => {
    expect(
      getEligibleRecordCards(walletCards as never, [{ card_name: "Old Card" }] as never).map((card) => card.card_name)
    ).toEqual(["Chase Sapphire Preferred"]);

    const relevantNews = getRelevantNews(walletCards as never, [
      { id: "1", title: "Annual fee increase", summary: "", tags: ["fee-change"], card_slugs: ["chase-sapphire-preferred"] },
      { id: "2", title: "Unrelated", summary: "", tags: ["bonus-change"], card_slugs: ["other-card"] },
      { id: "3", title: "New signup bonus", summary: "", tags: ["bonus-change"], card_slugs: ["chase-sapphire-preferred"] },
    ] as never, lookups);

    expect(relevantNews.map((item) => item.id)).toEqual(["1"]);
  });

  it("excludes archived/inactive cards from eligible referral list", () => {
    const eligibleFromWallet = getEligibleReferralCards(
      [],
      walletCards as never,
      [],
      lookups
    );
    expect(eligibleFromWallet.map((c) => c.card_name)).toEqual(["Chase Sapphire Preferred"]);

    const eligibleFromRecords = getEligibleReferralCards(
      [{ card_name: "Old Card" }, { card_name: "Chase Sapphire Preferred" }] as never,
      [],
      [],
      lookups
    );
    expect(eligibleFromRecords.map((c) => c.card_name)).toEqual(["Chase Sapphire Preferred"]);
  });

  it("resolves a wallet card whose name drifted after a rename (U.S. Bank -> US Bank)", () => {
    // Catalog holds the renamed card; the wallet still holds the OLD name and an
    // id that isn't among the catalog's db ids (mirrors a stale local catalog,
    // where exact-id and exact-name matching both miss).
    const catalog = [
      {
        card_id: "us-bank-cash-plus-visa-signature",
        db_card_id: 352,
        card_name: "US Bank Cash+ Visa Signature",
        annual_fee: 75,
        slug: "us-bank-cash-plus-visa-signature",
        active: true,
      },
    ];
    const lk = createCardLookups(catalog as never);
    const staleWallet = [{ card_id: 999, card_name: "U.S. Bank Cash+ Visa Signature" }];

    // Exact id and exact name both miss...
    expect(lk.byWalletId.has(999)).toBe(false);
    expect(lk.byName.has("U.S. Bank Cash+ Visa Signature")).toBe(false);
    // ...but the normalized fallback still resolves the card, so it's recognized
    // (its fee is counted, not dropped as an unknown card).
    expect(getTotalAnnualFees(staleWallet as never, lk)).toBe(75);

    // Old and new names fold together; the meaningful "+" in Cash+ is preserved.
    expect(normalizeCardName("U.S. Bank Cash+ Visa Signature")).toBe(
      normalizeCardName("US Bank Cash+ Visa Signature")
    );
    expect(normalizeCardName("US Bank Cash+ Visa Signature")).toContain("cash+");
  });
});
