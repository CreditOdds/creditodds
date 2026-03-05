// Point/mile valuations — keep in sync with data/valuations.yaml

export interface Valuation {
  program: string;
  slug: string;
  cpp: number;
  match: string[];
  exclude?: string[];
}

const valuations: Valuation[] = [
  { program: "Chase Ultimate Rewards", slug: "chase-ultimate-rewards", cpp: 1.25, match: ["chase sapphire", "freedom"] },
  { program: "Amex Membership Rewards", slug: "amex-membership-rewards", cpp: 1.2, match: ["american express", "amex", "gold card", "platinum card"], exclude: ["delta", "hilton", "skymiles"] },
  { program: "Delta SkyMiles", slug: "delta-skymiles", cpp: 1.1, match: ["delta", "skymiles"] },
  { program: "United MileagePlus", slug: "united-mileageplus", cpp: 1.2, match: ["united"] },
  { program: "Hilton Honors", slug: "hilton-honors", cpp: 0.5, match: ["hilton"] },
  { program: "World of Hyatt", slug: "world-of-hyatt", cpp: 2.0, match: ["hyatt"] },
  { program: "IHG One Rewards", slug: "ihg-one-rewards", cpp: 0.5, match: ["ihg"] },
  { program: "Marriott Bonvoy", slug: "marriott-bonvoy", cpp: 0.7, match: ["marriott", "bonvoy"] },
  { program: "Capital One Miles", slug: "capital-one-miles", cpp: 1.0, match: ["capital one"] },
  { program: "Bilt Rewards", slug: "bilt-rewards", cpp: 1.5, match: ["bilt"] },
  { program: "Citi ThankYou", slug: "citi-thankyou", cpp: 1.0, match: ["citi"] },
  { program: "Wells Fargo Rewards", slug: "wells-fargo-rewards", cpp: 1.0, match: ["wells fargo"] },
  { program: "Southwest Rapid Rewards", slug: "southwest-rapid-rewards", cpp: 1.4, match: ["southwest"] },
];

const DEFAULT_CPP = 1.0;

export function getValuation(cardName: string): number {
  const name = cardName.toLowerCase();
  for (const v of valuations) {
    if (v.exclude && v.exclude.some(ex => name.includes(ex))) continue;
    if (v.match.some(m => name.includes(m))) return v.cpp;
  }
  return DEFAULT_CPP;
}

export function getValuationBySlug(slug: string): Valuation | undefined {
  return valuations.find(v => v.slug === slug);
}

export function getAllValuations(): Valuation[] {
  return valuations;
}
