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
