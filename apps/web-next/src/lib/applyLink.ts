const UTM_SOURCE = 'creditodds';
const UTM_MEDIUM = 'referral';

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

interface ApplyLinkFields {
  apply_link?: string;
  special_apply_link?: string;
  affiliate_link?: string;
}

// The href behind a card's "Apply now" button. An affiliate_link wins and is
// returned verbatim: its own tracking parameters replace our UTM decoration.
// It is button-only; the page checkers never read it (see schema.json).
export function cardApplyHref(card: ApplyLinkFields): string | undefined {
  if (card.affiliate_link) return card.affiliate_link;
  return withApplySource(card.special_apply_link || card.apply_link);
}
