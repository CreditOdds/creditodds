'use client';

import { useEffect } from 'react';
import Clarity from '@microsoft/clarity';
import { useAuth } from '@/auth/AuthProvider';

let initialized = false;

export default function ClarityInit() {
  const { authState } = useAuth();

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && !initialized) {
      Clarity.init('w0ejzgxumv');
      initialized = true;
    }
  }, []);

  useEffect(() => {
    if (!initialized) return;

    if (authState.user) {
      Clarity.identify(authState.user.uid, undefined, undefined, authState.user.displayName || '');
    }
  }, [authState.user]);

  return null;
}
