'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, getAllCards } from '@/lib/api';

// Share one in-flight/settled catalog fetch across all hook consumers.
// Several components mount the hook at once (e.g. the admin stats tab), and
// concurrent fetches don't dedupe through the browser cache, so without this
// each mount pulls the full ~370 KB catalog again. Cleared on failure so a
// remount can retry.
let catalogPromise: Promise<Card[]> | null = null;

function fetchCatalog(): Promise<Card[]> {
  if (!catalogPromise) {
    catalogPromise = getAllCards().catch((err) => {
      catalogPromise = null;
      throw err;
    });
  }
  return catalogPromise;
}

interface UseCardCatalogOptions {
  activeOnly?: boolean;
}

export function filterCardCatalog(cards: Card[], search: string) {
  const normalizedSearch = search.trim().toLowerCase();

  if (!normalizedSearch) {
    return cards;
  }

  return cards.filter((card) =>
    card.card_name.toLowerCase().includes(normalizedSearch) ||
    card.bank.toLowerCase().includes(normalizedSearch)
  );
}

export function useCardCatalog(options: UseCardCatalogOptions = {}) {
  const { activeOnly = false } = options;
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchCatalog()
      .then((data) => {
        if (!isMounted) return;

        const filtered = activeOnly
          ? data.filter((card) => card.accepting_applications !== false)
          : data;

        setCards([...filtered].sort((a, b) => a.card_name.localeCompare(b.card_name)));
        setError(null);
      })
      .catch(() => {
        if (!isMounted) return;
        setCards([]);
        setError('Failed to load cards');
      });

    return () => {
      isMounted = false;
    };
  }, [activeOnly]);

  return useMemo(() => ({ cards, error }), [cards, error]);
}
