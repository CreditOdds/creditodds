// Point/mile valuations — keep in sync with data/valuations.yaml

export interface Valuation {
  program: string;
  slug: string;
  cpp: number;
  match: string[];
  exclude?: string[];
  toolSlug?: string; // path segment for /tools/<toolSlug>-to-usd
}

const valuations: Valuation[] = [
  { program: "Chase Ultimate Rewards", slug: "chase-ultimate-rewards", cpp: 1.25, match: ["chase sapphire", "freedom"], toolSlug: "chase-ultimate-rewards" },
  { program: "Amex Membership Rewards", slug: "amex-membership-rewards", cpp: 1.2, match: ["american express", "amex", "gold card", "platinum card"], exclude: ["delta", "hilton", "skymiles"], toolSlug: "amex-membership-rewards" },
  { program: "Delta SkyMiles", slug: "delta-skymiles", cpp: 1.20, match: ["delta", "skymiles"], toolSlug: "delta-skymiles" },
  { program: "United MileagePlus", slug: "united-mileageplus", cpp: 1.21, match: ["united"], toolSlug: "united-miles" },
  { program: "Hilton Honors", slug: "hilton-honors", cpp: 0.5, match: ["hilton"], toolSlug: "hilton-honors-points" },
  { program: "World of Hyatt", slug: "world-of-hyatt", cpp: 2.0, match: ["hyatt"], toolSlug: "world-of-hyatt-points" },
  { program: "IHG One Rewards", slug: "ihg-one-rewards", cpp: 0.5, match: ["ihg"], toolSlug: "ihg-one-rewards-points" },
  { program: "Marriott Bonvoy", slug: "marriott-bonvoy", cpp: 0.7, match: ["marriott", "bonvoy"], toolSlug: "marriott-bonvoy-points" },
  { program: "Capital One Miles", slug: "capital-one-miles", cpp: 1.0, match: ["capital one"], toolSlug: "capital-one-miles" },
  { program: "Bilt Rewards", slug: "bilt-rewards", cpp: 1.5, match: ["bilt"], toolSlug: "bilt-rewards-points" },
  { program: "Citi ThankYou", slug: "citi-thankyou", cpp: 1.0, match: ["citi"], toolSlug: "citi-thankyou-points" },
  { program: "Wells Fargo Rewards", slug: "wells-fargo-rewards", cpp: 1.0, match: ["wells fargo"] },
  { program: "Southwest Rapid Rewards", slug: "southwest-rapid-rewards", cpp: 1.30, match: ["southwest"], toolSlug: "southwest-rapid-rewards" },
];

const DEFAULT_CPP = 1.0;

export function getValuation(cardName: string): number {
  return getValuationDetails(cardName)?.cpp ?? DEFAULT_CPP;
}

export function getValuationDetails(cardName: string): Valuation | undefined {
  const name = cardName.toLowerCase();
  for (const v of valuations) {
    if (v.exclude && v.exclude.some(ex => name.includes(ex))) continue;
    if (v.match.some(m => name.includes(m))) return v;
  }
  return undefined;
}

export function getValuationBySlug(slug: string): Valuation | undefined {
  return valuations.find(v => v.slug === slug);
}

export function getAllValuations(): Valuation[] {
  return valuations;
}
