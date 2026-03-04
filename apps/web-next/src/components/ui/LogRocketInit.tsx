'use client';

import { useEffect } from 'react';
import LogRocket from 'logrocket';

export default function LogRocketInit() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      LogRocket.init('8ouxn1/creditodds');
    }
  }, []);

  return null;
}
