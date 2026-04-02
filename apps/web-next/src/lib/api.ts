const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://d2ojrhbh2dincr.cloudfront.net';

export interface CardReferral {
  referral_id: number;
  referral_link: string;
}

export interface RewardCategory {
  id: string;
  label: string;
}

export interface Reward {
  category: string;
  value: number;
  unit: string;
  note?: string;
  mode?: 'quarterly_rotating' | 'user_choice' | 'auto_top_spend';
  eligible_categories?: string[];
  choices?: number;
  current_categories?: string[];
  current_period?: string;
}

export interface SignupBonus {
  value: number;
  type: string;
  spend_requirement: number;
  timeframe_months: number;
}

export interface IntroAPR {
  rate: number;
  months: number;
}

export interface RegularAPR {
  min: number;
  max: number;
}

export interface CardAPR {
  purchase_intro?: IntroAPR;
  balance_transfer_intro?: IntroAPR;
  regular?: RegularAPR;
}

export interface CardBenefit {
  name: string;
  value: number;
  description: string;
  frequency: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'multi_year' | 'ongoing';
  category: 'dining' | 'dining_travel' | 'travel' | 'hotel' | 'entertainment' | 'shopping' | 'fitness' | 'lounge' | 'security' | 'gas' | 'streaming' | 'grocery' | 'rideshare' | 'other';
  enrollment_required?: boolean;
}

export interface Card {
  card_id: string | number;
  db_card_id?: number;
  card_name: string;
  slug: string;
  bank: string;
  card_image_link?: string;
  accepting_applications: boolean;
  active?: boolean;
  approved_median_credit_score?: number;
  approved_median_income?: number;
  approved_median_length_credit?: string | number;
  approved_count?: number;
  rejected_count?: number;
  total_records?: number;
  release_date?: string;
  tags?: string[];
  category?: string;
  annual_fee?: number;
  apply_link?: string;
  card_referral_link?: string;
  referrals?: CardReferral[];
  reward_type?: 'cashback' | 'points' | 'miles';
  rewards?: Reward[];
  signup_bonus?: SignupBonus;
  apr?: CardAPR;
  benefits?: CardBenefit[];
}

// GraphData is an array of series data
// Each chart has multiple series (e.g., approved and rejected)
// Each series is an array of [x, y] data points
export type GraphData = [number, number][][];

// Server-side fetch functions with ISR caching (5 minutes)
export async function getAllCards(): Promise<Card[]> {
  const res = await fetch(`${API_BASE}/cards`, {
    next: { revalidate: 300 },
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
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error('Failed to fetch card');
  return res.json();
}

export async function getCardGraphs(cardName: string): Promise<GraphData[]> {
  const res = await fetch(`${API_BASE}/graphs?card_name=${encodeURIComponent(cardName)}`, {
    next: { revalidate: 300 },
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

export async function archiveReferral(referralId: number, token: string) {
  const res = await fetch(`${API_BASE}/referrals`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ referral_id: referralId }),
  });
  if (!res.ok) throw new Error('Failed to archive referral');
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

// Recent records for ticker (no auth required)
export interface RecentRecord {
  record_id: number;
  result: number;
  credit_score: number;
  listed_income: number;
  submit_datetime: string;
  card_name: string;
  card_image_link?: string;
  bank: string;
}

export async function getRecentRecords(): Promise<RecentRecord[]> {
  const res = await fetch(`${API_BASE}/recent-records`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  return res.json();
}

// Track card page views (no auth required, fire-and-forget)
export async function trackCardView(cardId: number): Promise<void> {
  await fetch(`${API_BASE}/card-view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_id: cardId }),
  });
  // Fire and forget - don't throw on error
}

// Get card view counts for explore page sorting
export async function getCardViewCounts(period: 'trending' | 'all-time' = 'trending'): Promise<Record<number, number>> {
  const days = period === 'trending' ? 30 : 0;
  const res = await fetch(`${API_BASE}/card-view?period=${days}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return {};
  const data = await res.json();
  return data.views || {};
}

// CardWire - card metric change history
export interface CardWireEntry {
  id: number;
  card_id: number;
  card_name: string;
  card_image_link?: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export async function getCardWire(cardId: number): Promise<CardWireEntry[]> {
  const res = await fetch(`${API_BASE}/card-wire?card_id=${cardId}&limit=20`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.changes || [];
}

export async function getAllCardWire(limit = 100): Promise<CardWireEntry[]> {
  const res = await fetch(`${API_BASE}/card-wire?limit=${limit}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.changes || [];
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

// Leaderboard - top contributors
export interface LeaderboardEntry {
  display_name: string;
  records_count: number;
  approved_count: number;
  denied_count: number;
  first_submission: string;
  last_submission: string;
}

export interface LeaderboardStats {
  total_records: number;
  total_contributors: number;
  total_approved: number;
  total_denied: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  stats: LeaderboardStats;
}

export async function getLeaderboard(limit = 25): Promise<LeaderboardResponse> {
  const res = await fetch(`${API_BASE}/leaderboard?limit=${limit}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch leaderboard');
  }
  return res.json();
}

// Delete user account (removes referrals and wallet, keeps records anonymized)
export async function deleteAccount(token: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/account`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to delete account: ${errorText}`);
  }
  return res.json();
}

// Check Odds types and API functions
export interface CheckOddsCard {
  card_id: string | number;
  card_name: string;
  slug: string;
  bank: string;
  card_image_link?: string;
  annual_fee?: number;
  reward_type?: string;
  tags?: string[];
  approved_count: number;
  total_records: number;
  approved_data_points: number;
  has_enough_data: boolean;
  median_credit_score: number | null;
  median_income: number | null;
  median_length_credit: number | null;
  above_credit_score: boolean | null;
  above_income: boolean | null;
  above_length_credit: boolean | null;
  match_score: number;
}

export interface CheckOddsResponse {
  cards: CheckOddsCard[];
  search: {
    credit_score: number;
    income: number;
    length_credit: number;
  };
}

export interface ApprovalSearch {
  id: number;
  credit_score: number;
  income: number;
  length_credit: number;
  created_at: string;
}

export async function checkOdds(
  data: { credit_score: number; income: number; length_credit: number },
  token: string
): Promise<CheckOddsResponse> {
  const res = await fetch(`${API_BASE}/check-odds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to check odds: ${errorText}`);
  }
  return res.json();
}

export async function getApprovalSearches(token: string): Promise<ApprovalSearch[]> {
  const res = await fetch(`${API_BASE}/check-odds`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to fetch searches: ${errorText}`);
  }
  return res.json();
}

// Card Ratings
export interface CardRatingAggregates {
  count: number;
  average: number | null;
}

export async function getCardRatings(cardName: string): Promise<CardRatingAggregates> {
  const res = await fetch(`${API_BASE}/ratings?card_name=${encodeURIComponent(cardName)}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return { count: 0, average: null };
  return res.json();
}

export async function getUserCardRating(cardName: string, token: string): Promise<number | null> {
  const res = await fetch(`${API_BASE}/ratings/me?card_name=${encodeURIComponent(cardName)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.rating;
}

export async function submitCardRating(
  cardName: string,
  rating: number,
  token: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/ratings/me`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ card_name: cardName, rating }),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to submit rating: ${errorText}`);
  }
}

// ============ ADMIN API FUNCTIONS ============

// Admin Graphs
export interface AdminGraphsData {
  records_daily: { date: string; count: number }[];
  searches_daily: { date: string; count: number }[];
  referrals_daily: { date: string; count: number }[];
  dau_daily: { date: string; count: number }[];
}

export async function getAdminGraphs(token: string, days = 30): Promise<AdminGraphsData> {
  const res = await fetch(`${API_BASE}/admin/graphs?days=${days}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to fetch admin graphs: ${res.status} ${errorText}`);
  }
  return res.json();
}

// Admin Stats
export interface AdminStats {
  total_records: number;
  total_referrals: number;
  total_users: number;
  pending_referrals: number;
  records_today: number;
  records_this_week: number;
  top_cards: { card_name: string; count: number }[];
}

export async function getAdminStats(token: string): Promise<AdminStats> {
  const res = await fetch(`${API_BASE}/admin/stats`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to fetch admin stats: ${res.status} ${errorText}`);
  }
  return res.json();
}

// Admin Records
export interface AdminRecord {
  record_id: number;
  card_id: number;
  card_name: string;
  card_image_link?: string;
  bank: string;
  credit_score: number;
  listed_income: number;
  length_credit: number;
  result: boolean;
  submit_datetime: string;
  date_applied?: string;
  submitter_id: string;
  submitter_email?: string;
  submitter_ip_address?: string;
}

export interface AdminRecordDetail extends AdminRecord {
  credit_score_source?: number;
  starting_credit_limit?: number | null;
  bank_customer?: boolean;
  reason_denied?: string | null;
  inquiries_3?: number | null;
  inquiries_12?: number | null;
  inquiries_24?: number | null;
  admin_review?: number;
}

export interface AdminRecordsResponse {
  records: AdminRecord[];
  total: number;
  limit: number;
  offset: number;
}

export async function getAdminRecords(
  token: string,
  limit = 100,
  offset = 0,
  cardId?: number
): Promise<AdminRecordsResponse> {
  let url = `${API_BASE}/admin/records?limit=${limit}&offset=${offset}`;
  if (cardId) url += `&card_id=${cardId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to fetch admin records: ${res.status} ${errorText}`);
  }
  return res.json();
}

export async function updateAdminRecord(
  data: { record_id: number; [key: string]: unknown },
  token: string
): Promise<{ message: string; record_id: number }> {
  const res = await fetch(`${API_BASE}/admin/records`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to update record: ${errorText}`);
  }
  return res.json();
}

export async function createAdminRecord(
  data: unknown,
  token: string
): Promise<{ message: string; record_id: number }> {
  const res = await fetch(`${API_BASE}/admin/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to create record: ${errorText}`);
  }
  return res.json();
}

export async function deleteAdminRecord(
  recordId: number,
  token: string
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/admin/records?record_id=${recordId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to delete record: ${errorText}`);
  }
  return res.json();
}

// Admin Referrals
export interface AdminReferral {
  referral_id: number;
  card_id: number;
  card_name: string;
  card_image_link?: string;
  bank: string;
  referral_link: string;
  card_referral_link?: string;
  submitter_id: string;
  submitter_email?: string;
  submit_datetime: string;
  admin_approved: number;
  archived_at: string | null;
  impressions: number;
  clicks: number;
}

export interface AdminReferralsResponse {
  referrals: AdminReferral[];
  total: number;
  limit: number;
  offset: number;
}

export async function getAdminReferrals(
  token: string,
  limit = 100,
  offset = 0,
  pendingOnly = false
): Promise<AdminReferralsResponse> {
  const url = `${API_BASE}/admin/referrals?limit=${limit}&offset=${offset}${pendingOnly ? '&pending=true' : ''}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to fetch admin referrals: ${res.status} ${errorText}`);
  }
  return res.json();
}

export async function updateReferralApproval(
  referralId: number,
  approved: boolean,
  token: string,
  referralLink?: string
): Promise<{ message: string }> {
  const body: Record<string, unknown> = { referral_id: referralId, approved };
  if (referralLink) {
    body.referral_link = referralLink;
  }
  const res = await fetch(`${API_BASE}/admin/referrals`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to update referral: ${errorText}`);
  }
  return res.json();
}

export async function deleteAdminReferral(
  referralId: number,
  token: string
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/admin/referrals?referral_id=${referralId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to delete referral: ${errorText}`);
  }
  return res.json();
}

// Admin Searches
export interface AdminSearch {
  id: number;
  user_id: string;
  credit_score: number;
  income: number;
  length_credit: number;
  created_at: string;
}

export interface AdminSearchesResponse {
  searches: AdminSearch[];
  total: number;
  limit: number;
  offset: number;
}

export async function getAdminSearches(
  token: string,
  limit = 100,
  offset = 0
): Promise<AdminSearchesResponse> {
  const res = await fetch(`${API_BASE}/admin/searches?limit=${limit}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to fetch admin searches: ${res.status} ${errorText}`);
  }
  return res.json();
}

// Admin User Lookup
export interface AdminUserData {
  user_id: string;
  records: AdminRecord[];
  searches: AdminSearch[];
  wallet: WalletCard[];
  referrals: AdminReferral[];
}

export async function getAdminUser(
  userId: string,
  token: string
): Promise<AdminUserData> {
  const res = await fetch(`${API_BASE}/admin/user?user_id=${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to look up user: ${res.status} ${errorText}`);
  }
  return res.json();
}

// Admin Audit Log
export interface AuditLogEntry {
  id: number;
  admin_id: string;
  admin_email?: string;
  action: string;
  entity_type: string;
  entity_id?: number;
  details?: string;
  created_at: string;
}

export interface AdminAuditResponse {
  logs: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export async function getAdminAuditLog(
  token: string,
  limit = 100,
  offset = 0
): Promise<AdminAuditResponse> {
  const res = await fetch(`${API_BASE}/admin/audit?limit=${limit}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to fetch audit log: ${res.status} ${errorText}`);
  }
  return res.json();
}
