'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/auth/AuthProvider';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://d2ojrhbh2dincr.cloudfront.net';

export interface UserSettings {
  plaid_beta_enabled: boolean;
  avatar_seed: string | null;
}

interface UserSettingsContextType {
  settings: UserSettings | null;
  isLoading: boolean;
  setAvatarSeed: (seed: string) => Promise<void>;
}

const DEFAULT_SETTINGS: UserSettings = {
  plaid_beta_enabled: false,
  avatar_seed: null,
};

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const { authState, getToken } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authState.isAuthenticated || !authState.user) {
      setSettings(null);
      fetchedForUserRef.current = null;
      return;
    }
    if (fetchedForUserRef.current === authState.user.uid) return;
    fetchedForUserRef.current = authState.user.uid;

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`${API_BASE}/user-settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`user-settings GET ${res.status}`);
        const data = (await res.json()) as UserSettings;
        if (!cancelled) setSettings({ ...DEFAULT_SETTINGS, ...data });
      } catch (err) {
        console.error('Failed to load user settings:', err);
        if (!cancelled) setSettings(DEFAULT_SETTINGS);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authState.isAuthenticated, authState.user, getToken]);

  const setAvatarSeed = useCallback(
    async (seed: string) => {
      const prev = settings;
      setSettings((s) => ({ ...(s ?? DEFAULT_SETTINGS), avatar_seed: seed }));
      try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await fetch(`${API_BASE}/user-settings`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar_seed: seed }),
        });
        if (!res.ok) throw new Error(`user-settings PUT ${res.status}`);
        const data = (await res.json()) as UserSettings;
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      } catch (err) {
        setSettings(prev);
        throw err;
      }
    },
    [settings, getToken]
  );

  const value = useMemo<UserSettingsContextType>(
    () => ({ settings, isLoading, setAvatarSeed }),
    [settings, isLoading, setAvatarSeed]
  );

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}

export function useUserSettings(): UserSettingsContextType {
  const ctx = useContext(UserSettingsContext);
  if (!ctx) throw new Error('useUserSettings must be used within UserSettingsProvider');
  return ctx;
}
