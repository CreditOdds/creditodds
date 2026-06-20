'use client';

import { useEffect, useRef } from 'react';
import { trackContentView } from '@/lib/api';

// Fires a single fire-and-forget view event on mount for an article or news
// item. Renders nothing. Mirrors the card page's view tracking in CardClient.
export default function ViewTracker({
  type,
  contentKey,
}: {
  type: 'article' | 'news';
  contentKey: string;
}) {
  const tracked = useRef(false);

  useEffect(() => {
    if (!contentKey || tracked.current) return;
    tracked.current = true;
    trackContentView(type, contentKey).catch(() => {});
  }, [type, contentKey]);

  return null;
}
