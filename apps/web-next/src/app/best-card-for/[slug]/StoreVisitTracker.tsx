'use client';

import { useEffect, useRef } from 'react';
import { trackStoreEvent } from '@/lib/api';

// Fires a single fire-and-forget 'visit' event on mount for a /best-card-for
// store page. Renders nothing. Mirrors ViewTracker (article/news views).
export default function StoreVisitTracker({ storeSlug }: { storeSlug: string }) {
  const tracked = useRef(false);

  useEffect(() => {
    if (!storeSlug || tracked.current) return;
    tracked.current = true;
    trackStoreEvent('visit', storeSlug).catch(() => {});
  }, [storeSlug]);

  return null;
}
