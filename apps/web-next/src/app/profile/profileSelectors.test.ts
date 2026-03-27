import { describe, expect, it } from "vitest";
import {
  createCardLookups,
  getEligibleRecordCards,
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
      { id: "1", title: "Preferred gets a new offer", summary: "", card_slugs: ["chase-sapphire-preferred"] },
      { id: "2", title: "Unrelated", summary: "", card_slugs: ["other-card"] },
    ] as never, lookups);

    expect(relevantNews.map((item) => item.id)).toEqual(["1"]);
  });
});
