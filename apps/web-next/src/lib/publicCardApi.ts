import { fetchWithRetry } from './fetchWithRetry';
import { CardNotFoundError } from './cardNotFound';
import type { Card } from './api';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://d2ojrhbh2dincr.cloudfront.net';

export async function getPublicCard(cardName: string): Promise<Card> {
  const res = await fetchWithRetry(`${API_BASE}/card?card_name=${encodeURIComponent(cardName)}`, {
    next: { revalidate: 300 },
  });
  if (res.status === 404) throw new CardNotFoundError();
  if (!res.ok) throw new Error(`Failed to fetch card: ${res.status}`);
  const card = await res.json();
  if (!card || typeof card.card_name !== 'string' || !card.card_name || typeof card.slug !== 'string' || !card.slug) {
    throw new Error('Invalid card response');
  }
  return card;
}
