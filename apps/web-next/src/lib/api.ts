const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://c301gwdbok.execute-api.us-east-2.amazonaws.com/Prod';

export interface CardReferral {
  referral_id: number;
  referral_link: string;
}

export interface Card {
  card_id: string | number;
  db_card_id?: number;
  card_name: string;
  bank: string;
  card_image_link?: string;
  accepting_applications: boolean;
  approved_median_credit_score?: number;
  approved_median_income?: number;
  approved_median_length_credit?: string | number;
  approved_count?: number;
  rejected_count?: number;
  release_date?: string;
  tags?: string[];
  annual_fee?: number;
  apply_link?: string;
  card_referral_link?: string;
  referrals?: CardReferral[];
}

// GraphData is an array of series data
// Each chart has multiple series (e.g., approved and rejected)
// Each series is an array of [x, y] data points
export type GraphData = [number, number][][];

// Server-side fetch functions (caching disabled during development)
export async function getAllCards(): Promise<Card[]> {
  const res = await fetch(`${API_BASE}/cards`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch cards');
  return res.json();
}

export async function getCardsByBank(bankName: string): Promise<Card[]> {
  const allCards = await getAllCards();
  return allCards.filter(card => card.bank.toLowerCase() === bankName.toLowerCase());
}

export async function getAllBanks(): Promise<string[]> {
  const allCards = await getAllCards();
  const banks = new Set(allCards.map(card => card.bank));
  return Array.from(banks).sort();
}

export async function getCard(cardName: string): Promise<Card> {
  const res = await fetch(`${API_BASE}/card?card_name=${encodeURIComponent(cardName)}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch card');
  return res.json();
}

export async function getCardGraphs(cardName: string): Promise<GraphData[]> {
  const res = await fetch(`${API_BASE}/graphs?card_name=${encodeURIComponent(cardName)}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch graphs');
  return res.json();
}

// Client-side authenticated API calls
export async function getRecords(token: string) {
  const res = await fetch(`${API_BASE}/records`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    console.error('getRecords error:', res.status, errorText);
    throw new Error(`Failed to fetch records: ${res.status}`);
  }
  return res.json();
}

export async function createRecord(data: unknown, token: string) {
  const res = await fetch(`${API_BASE}/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create record');
  return res.json();
}

export async function deleteRecord(recordId: number, token: string) {
  const res = await fetch(`${API_BASE}/records?record_id=${recordId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error('Failed to delete record');
  return res.json();
}

export async function getReferrals(token: string) {
  const res = await fetch(`${API_BASE}/referrals`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    console.error('getReferrals error:', res.status, errorText);
    throw new Error(`Failed to fetch referrals: ${res.status}`);
  }
  return res.json();
}

export async function createReferral(data: unknown, token: string) {
  const res = await fetch(`${API_BASE}/referrals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create referral');
  return res.json();
}

export async function deleteReferral(referralId: number, token: string) {
  const res = await fetch(`${API_BASE}/referrals?referral_id=${referralId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error('Failed to delete referral');
  return res.json();
}

export async function getProfile(token: string) {
  const res = await fetch(`${API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    console.error('getProfile error:', res.status, errorText);
    throw new Error(`Failed to fetch profile: ${res.status}`);
  }
  return res.json();
}

// Wallet types and API functions
export interface WalletCard {
  id: number;
  card_id: number;
  card_name: string;
  bank: string;
  card_image_link?: string;
  acquired_month?: number;
  acquired_year?: number;
  created_at: string;
}

export async function getWallet(token: string): Promise<WalletCard[]> {
  const res = await fetch(`${API_BASE}/wallet`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    console.error('getWallet error:', res.status, errorText);
    throw new Error(`Failed to fetch wallet: ${res.status}`);
  }
  return res.json();
}

export async function addToWallet(
  cardId: number,
  acquiredMonth?: number,
  acquiredYear?: number,
  token?: string
): Promise<{ message: string; card_id: number }> {
  if (!token) throw new Error('Authentication required');
  const res = await fetch(`${API_BASE}/wallet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      card_id: cardId,
      acquired_month: acquiredMonth || null,
      acquired_year: acquiredYear || null,
    }),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to add card to wallet: ${errorText}`);
  }
  return res.json();
}

export async function removeFromWallet(cardId: number, token: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/wallet`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ card_id: cardId }),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to remove card from wallet: ${errorText}`);
  }
  return res.json();
}

// Track referral impressions and clicks (no auth required)
export async function trackReferralEvent(
  referralId: number,
  eventType: 'impression' | 'click'
): Promise<void> {
  await fetch(`${API_BASE}/referral-stats`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      referral_id: referralId,
      event_type: eventType,
    }),
  });
  // Fire and forget - don't throw on error
}
