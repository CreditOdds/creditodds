import type { Store } from './stores';

export function getRelatedStores(
  store: Store,
  allStores: Store[],
  limit = 8,
): Store[] {
  const primaryCategory = store.categories[0];
  if (!primaryCategory) return [];

  return allStores
    .filter(candidate => (
      candidate.slug !== store.slug
      && candidate.categories[0] === primaryCategory
    ))
    .map(candidate => ({
      store: candidate,
      overlap: candidate.categories.filter(category => store.categories.includes(category)).length,
    }))
    .sort((a, b) => b.overlap - a.overlap || a.store.name.localeCompare(b.store.name))
    .slice(0, limit)
    .map(candidate => candidate.store);
}
