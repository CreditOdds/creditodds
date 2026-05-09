// Match a Google Places result to a Store entry from data/stores/*.yaml so
// the wallet matcher can apply brand-aware rules (co-brand cards, gated
// rewards like Marriott Bonvoy 6x). Returns null when no brand matches —
// the caller should then fall back to category-based ranking.

export interface StoreBrand {
  slug: string;
  name: string;
  aliases?: string[];
  categories: string[];
  co_brand_cards?: string[];
}

export interface StoreBrandMatch {
  store: StoreBrand;
  matchedTerm: string;
  matchedBy: 'name' | 'alias';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary match against the place name. \b only anchors on ASCII
// word chars in JS regex; that's fine — every brand we care about for
// co-brand earn (Marriott, Hilton, Hyatt, IHG, Wyndham, Delta, United,
// American, JetBlue, Southwest, Hawaiian, Costco, Apple, Amazon, etc.)
// is ASCII. Aliases that contain non-ASCII chars (Marriott's "GLō",
// "Vīb", "Le Méridien") won't match precisely; that's an acceptable
// gap until we hit a real case.
function termMatches(haystack: string, term: string): boolean {
  const re = new RegExp(`\\b${escapeRegex(term.toLowerCase())}\\b`);
  return re.test(haystack);
}

// Picks the best store brand that appears in the place name, optionally
// constrained to stores whose categories include `placeCategory` (so a
// "Marriott Restaurant" pin doesn't get matched as the Marriott hotel
// brand). Returns the longest matching term across all candidates so
// "JW Marriott Essex House" prefers alias "JW Marriott" over plain
// "Marriott", and "Best Western Plus" doesn't bleed into "Best Buy".
export function matchPlaceToStoreBrand(
  placeName: string,
  placeCategory: string | null,
  stores: StoreBrand[],
): StoreBrandMatch | null {
  if (!placeName) return null;
  const haystack = placeName.toLowerCase();
  let best: { match: StoreBrandMatch; termLength: number } | null = null;

  for (const store of stores) {
    if (placeCategory && !store.categories.includes(placeCategory)) continue;

    const candidates: Array<{ term: string; matchedBy: 'name' | 'alias' }> = [
      { term: store.name, matchedBy: 'name' },
      ...((store.aliases || []).map((a) => ({ term: a, matchedBy: 'alias' as const }))),
    ];

    for (const { term, matchedBy } of candidates) {
      // Skip very short terms — single letters or two-char codes would
      // create false positives ("W" alias for W Hotels would match any
      // word boundary `w`).
      if (term.length < 3) continue;
      if (termMatches(haystack, term)) {
        if (!best || term.length > best.termLength) {
          best = {
            match: { store, matchedTerm: term, matchedBy },
            termLength: term.length,
          };
        }
      }
    }
  }

  return best?.match ?? null;
}
