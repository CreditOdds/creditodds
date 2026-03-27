import { describe, expect, it } from "vitest";
import { filterCardsByKeywords, filterNewsByKeywords } from "./rewardToolUtils";

describe("rewardToolUtils", () => {
  it("filters accepting cards by include and exclude keywords", () => {
    const cards = [
      { card_name: "The Platinum Card from American Express", accepting_applications: true },
      { card_name: "Hilton Honors American Express Surpass Card", accepting_applications: true },
      { card_name: "American Express Green Card", accepting_applications: false },
    ] as const;

    const result = filterCardsByKeywords(cards as never, {
      include: ["american express", "amex"],
      exclude: ["hilton"],
    });

    expect(result.map((card) => card.card_name)).toEqual([
      "The Platinum Card from American Express",
    ]);
  });

  it("matches news keywords across title and summary", () => {
    const items = [
      { id: "1", title: "Chase tweaks Ultimate Rewards portal", summary: "Transfer partners stay the same." },
      { id: "2", title: "Bilt adds a new dining bonus", summary: "A weekend promo." },
    ] as const;

    const result = filterNewsByKeywords(items as never, ["chase", "ultimate rewards"]);

    expect(result.map((item) => item.id)).toEqual(["1"]);
  });
});
