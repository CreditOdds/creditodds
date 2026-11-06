import type { Card } from '../../../web-next/src/lib/api';

// Reuse the existing public API/CDN enrichment rather than opening another
// database connection from the recommendation Lambda. This is public data only.
const CATALOG_URL = 'https://d2ojrhbh2dincr.cloudfront.net/cards';
const TTL_MS = 5 * 60 * 1000;
let cached: { cards: Card[]; expires: number } | undefined;
let pending: Promise<Card[]> | undefined;

export function getAllCards(): Promise<Card[]> {
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.cards);
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Public card catalog returned ${response.status}`);
    const cards = await response.json();
    if (!Array.isArray(cards) || !cards.length || cards.some(card => typeof card?.slug !== 'string')) {
      throw new Error('Invalid public card catalog');
    }
    cached = { cards, expires: Date.now() + TTL_MS };
    return cards as Card[];
  })().finally(() => { pending = undefined; });
  return pending;
}
