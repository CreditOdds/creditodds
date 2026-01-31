'use client';

/**
 * Centralized API client with auth token handling (#9)
 * Updated for Firebase Authentication
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://d2ojrhbh2dincr.cloudfront.net';

type TokenGetter = () => Promise<string | null>;

class ApiClient {
  private getToken: TokenGetter | null = null;

  setTokenGetter(getter: TokenGetter) {
    this.getToken = getter;
  }

  private async fetchToken(): Promise<string> {
    if (!this.getToken) {
      throw new Error('Token getter not initialized. Call setTokenGetter first.');
    }
    const token = await this.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
    return token;
  }

  async get<T>(endpoint: string, authenticated = false): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (authenticated) {
      const token = await this.fetchToken();
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers,
      cache: authenticated ? 'no-store' : 'default',
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error(`API error ${endpoint}:`, res.status, errorText);
      throw new Error(`API request failed: ${res.status}`);
    }

    return res.json();
  }

  async post<T>(endpoint: string, data: unknown, authenticated = true): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (authenticated) {
      const token = await this.fetchToken();
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error(`API error ${endpoint}:`, res.status, errorText);
      throw new Error(errorText || `API request failed: ${res.status}`);
    }

    return res.json();
  }
}

// Singleton instance
export const apiClient = new ApiClient();

// Typed API methods
export const api = {
  // Authenticated endpoints
  getRecords: () => apiClient.get<Record[]>('/records', true),
  getReferrals: () => apiClient.get<[Referral[], OpenReferral[]]>('/referrals', true),
  getProfile: () => apiClient.get<Profile>('/profile', true),
  createRecord: (data: CreateRecordData) => apiClient.post('/records', data),
  createReferral: (data: CreateReferralData) => apiClient.post('/referrals', data),
};

// Types
interface Record {
  record_id: number;
  card_id: number;
  card_name: string;
  card_image_link?: string;
  credit_score: number;
  listed_income: number;
  length_credit: number;
  result: boolean;
  submit_datetime: string;
}

interface Referral {
  referral_id: number;
  card_id: string;
  card_name: string;
  card_image_link?: string;
  referral_link: string;
  admin_approved: boolean;
}

interface OpenReferral {
  card_id: string;
  card_name: string;
  card_image_link?: string;
}

interface Profile {
  username: string;
  email: string;
  records_count: number;
  referrals_count: number;
}

interface CreateRecordData {
  card_id: number | string;
  credit_score: number;
  credit_score_source: string;
  listed_income: number;
  date_applied: string;
  length_credit: number;
  bank_customer: boolean;
  result: boolean;
  starting_credit_limit?: number;
  reason_denied?: string;
  inquiries_3?: number;
  inquiries_12?: number;
  inquiries_24?: number;
}

interface CreateReferralData {
  card_id: string;
  referral_link: string;
}
