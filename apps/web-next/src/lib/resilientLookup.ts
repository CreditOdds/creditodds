// A worker-local, bounded fallback for public editorial content. This is not
// an authoritative cache: every new lookup still tries the current catalog.
export function createResilientLookup<T>(load: () => Promise<T[]>, identify: (item: T) => string) {
  let snapshot: { items: T[]; loadedAt: number } | undefined;
  let pending: Promise<T[]> | undefined;
  const maxAgeMs = 60 * 60 * 1000;

  function refresh() {
    if (!pending) {
      pending = load().then(items => {
        snapshot = { items, loadedAt: Date.now() };
        return items;
      }).finally(() => { pending = undefined; });
    }
    return pending;
  }

  return async (id: string): Promise<T | null> => {
    try {
      const items = await refresh();
      return items.find(item => identify(item) === id) ?? null;
    } catch (error) {
      // Don't hide malformed catalogs, HTTP failures, or caller cancellation.
      if (error instanceof Error && error.name === 'TimeoutError' && snapshot &&
          Date.now() - snapshot.loadedAt < maxAgeMs) {
        const item = snapshot.items.find(item => identify(item) === id);
        if (item) {
          console.warn('Serving previously loaded editorial content after a refresh timeout');
          return item;
        }
      }
      throw error;
    }
  };
}
