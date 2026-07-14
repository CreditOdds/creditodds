const UTM_SOURCE = 'creditodds';
const UTM_MEDIUM = 'referral';

export const REFLECT_TEST_SOURCE = 'best-0-apr-cards';
export const REFLECT_TEST_CARD_SLUG = 'wells-fargo-reflect';
export const REFLECT_TEST_APPLY_LINK =
  'https://track.acclaimnetwork.com/apn/click?b2s=302211&SUBID=PARAM&praff=5747';

// Exactly seven days from the test launch (July 13 at 10:40 p.m. ET).
export const REFLECT_TEST_START = new Date('2026-07-14T02:40:00.000Z');
export const REFLECT_TEST_END = new Date('2026-07-21T02:40:00.000Z');

export function withApplySource(url: string | undefined | null): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    const hasSource =
      parsed.searchParams.has('utm_source') || parsed.searchParams.has('source');
    if (hasSource) return url;

    parsed.searchParams.set('utm_source', UTM_SOURCE);
    if (!parsed.searchParams.has('utm_medium')) {
      parsed.searchParams.set('utm_medium', UTM_MEDIUM);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function bestCardDetailHref(cardSlug: string, bestPageSlug: string): string {
  const path = `/card/${cardSlug}`;
  if (
    cardSlug !== REFLECT_TEST_CARD_SLUG ||
    bestPageSlug !== REFLECT_TEST_SOURCE
  ) {
    return path;
  }

  return `${path}?from=${REFLECT_TEST_SOURCE}`;
}

interface ResolveApplyLinkOptions {
  cardSlug: string;
  defaultUrl: string | undefined | null;
  source: string | undefined | null;
  now?: Date;
}

export function resolveApplyLink({
  cardSlug,
  defaultUrl,
  source,
  now = new Date(),
}: ResolveApplyLinkOptions): string | undefined {
  if (
    cardSlug === REFLECT_TEST_CARD_SLUG &&
    source === REFLECT_TEST_SOURCE &&
    now >= REFLECT_TEST_START &&
    now < REFLECT_TEST_END
  ) {
    // Preserve the Acclaim URL exactly as supplied; its tracking parameters
    // replace CreditOdds' usual UTM decoration for this test cohort.
    return REFLECT_TEST_APPLY_LINK;
  }

  return withApplySource(defaultUrl);
}
