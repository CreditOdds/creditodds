import { describe, expect, it } from 'vitest';
import type { Store } from './stores';
import { getRelatedStores } from './relatedStores';

function makeStore(name: string, categories: string[]): Store {
  return {
    name,
    slug: name.toLowerCase().replaceAll(' ', '-'),
    categories,
    intro: `${name} intro`,
  };
}

describe('getRelatedStores', () => {
  it('only returns stores in the current store primary category', () => {
    const current = makeStore('Current Hotel', ['hotels', 'travel']);
    const hotel = makeStore('Another Hotel', ['hotels', 'travel']);
    const airline = makeStore('An Airline', ['airlines', 'travel']);

    expect(getRelatedStores(current, [current, airline, hotel])).toEqual([hotel]);
  });

  it('prefers stores with more category overlap within the primary category', () => {
    const current = makeStore('Current Store', ['department_stores', 'online_shopping']);
    const inStoreOnly = makeStore('Alpha Store', ['department_stores']);
    const onlineToo = makeStore('Zulu Store', ['department_stores', 'online_shopping']);

    expect(getRelatedStores(current, [inStoreOnly, onlineToo]).map(store => store.name)).toEqual([
      'Zulu Store',
      'Alpha Store',
    ]);
  });

  it('returns no related stores when the current store has no category', () => {
    const current = makeStore('Uncategorized Store', []);

    expect(getRelatedStores(current, [makeStore('Other Store', [])])).toEqual([]);
  });
});
