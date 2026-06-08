import { describe, expect, it } from "vitest";
import { buildCreditCardSchema } from "./JsonLd";
import { Card } from "@/lib/api";

const baseCard: Card = {
  card_id: "1",
  card_name: "Citi Custom Cash",
  slug: "citi-custom-cash",
  bank: "Citi",
  accepting_applications: true,
  annual_fee: 0,
  approved_median_credit_score: 751,
  approved_median_income: 76500,
  approved_median_length_credit: 7,
};

describe("buildCreditCardSchema", () => {
  it("uses a Google-supported Product parent for review markup when rated", () => {
    const schema = buildCreditCardSchema({
      card: baseCard,
      ratings: { count: 2, average: 5 },
    });

    expect(schema).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Product",
      additionalType: "https://schema.org/CreditCard",
      name: "Citi Custom Cash",
      url: "https://creditodds.com/card/citi-custom-cash",
      category: "Credit card",
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "5.0",
        ratingCount: 2,
      },
    });
  });

  it("does not emit an offers block so GSC doesn't flag Merchant listings", () => {
    const rated = buildCreditCardSchema({
      card: baseCard,
      ratings: { count: 2, average: 5 },
    });
    const unrated = buildCreditCardSchema({
      card: baseCard,
      ratings: { count: 0, average: null },
    });

    expect(rated).not.toHaveProperty("offers");
    expect(unrated).not.toHaveProperty("offers");
  });

  it("surfaces annual fee via additionalProperty instead of offers", () => {
    const schema = buildCreditCardSchema({
      card: { ...baseCard, annual_fee: 95 },
      ratings: { count: 0, average: null },
    });

    expect(schema.additionalProperty).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Annual Fee", value: "$95" }),
      ]),
    );
  });

  it("omits aggregateRating when there are no ratings", () => {
    const schema = buildCreditCardSchema({
      card: baseCard,
      ratings: { count: 0, average: null },
    });

    expect(schema).not.toHaveProperty("aggregateRating");
  });

  it("falls back to CreditCard type when there are no ratings so GSC doesn't flag Product snippets", () => {
    const schema = buildCreditCardSchema({
      card: baseCard,
      ratings: { count: 0, average: null },
    });

    expect(schema["@type"]).toBe("CreditCard");
    expect(schema).not.toHaveProperty("additionalType");
  });
});
