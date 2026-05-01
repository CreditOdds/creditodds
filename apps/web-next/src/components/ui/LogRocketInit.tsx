'use client';

import { useEffect } from 'react';
import LogRocket from 'logrocket';
import { useAuth } from '@/auth/AuthProvider';

let initialized = false;

export default function LogRocketInit() {
  const { authState } = useAuth();

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && !initialized) {
      LogRocket.init('2k1opa/creditodds');
      initialized = true;
    }
  }, []);

  useEffect(() => {
    if (!initialized) return;

    if (authState.user) {
      LogRocket.identify(authState.user.uid, {
        name: authState.user.displayName || '',
        email: authState.user.email || '',
      });
    }
  }, [authState.user]);

  return null;
}
