import { describe, expect, it } from "vitest";
import {
  createCardLookups,
  getEligibleRecordCards,
  getEligibleReferralCards,
  getRelevantNews,
  getTotalAnnualFees,
  getWalletVisibility,
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
});
