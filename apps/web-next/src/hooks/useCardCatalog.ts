'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, getAllCards } from '@/lib/api';

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

    getAllCards()
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
