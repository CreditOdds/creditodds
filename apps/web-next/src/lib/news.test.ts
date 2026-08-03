import { describe, it, expect } from 'vitest';
import { getNewsCards, type NewsItem } from './news';

const base: NewsItem = {
  id: 'x',
  date: '2026-08-03',
  title: 'T',
  summary: 'S',
  tags: ['general'],
};

describe('getNewsCards', () => {
  it('returns cards_info untouched when the builder provided it', () => {
    const cards = getNewsCards({
      ...base,
      card_slugs: ['a', 'b'],
      card_names: ['A', 'B'],
      cards_info: [
        { slug: 'a', name: 'A', image: null },
        { slug: 'b', name: 'B', image: 'b.png' },
      ],
    });
    expect(cards).toEqual([
      { slug: 'a', name: 'A', image: null },
      { slug: 'b', name: 'B', image: 'b.png' },
    ]);
  });

  it('pairs the legacy arrays when they line up', () => {
    const cards = getNewsCards({
      ...base,
      card_slugs: ['a', 'b'],
      card_names: ['A', 'B'],
      card_image_links: ['a.png', 'b.png'],
    });
    expect(cards).toEqual([
      { slug: 'a', name: 'A', image: 'a.png' },
      { slug: 'b', name: 'B', image: 'b.png' },
    ]);
  });

  it('never pairs a legacy image array that was filtered short', () => {
    // Card "a" was missing from cards.json, so the old builder emitted only
    // b.png. Indexing it positionally would have shown b's art under a's name.
    const cards = getNewsCards({
      ...base,
      card_slugs: ['a', 'b'],
      card_names: ['A', 'B'],
      card_image_links: ['b.png'],
    });
    expect(cards).toEqual([
      { slug: 'a', name: 'A', image: null },
      { slug: 'b', name: 'B', image: null },
    ]);
  });

  it('handles the singular legacy fields', () => {
    const cards = getNewsCards({
      ...base,
      card_slug: 'a',
      card_name: 'A',
      card_image_link: 'a.png',
    });
    expect(cards).toEqual([{ slug: 'a', name: 'A', image: 'a.png' }]);
  });

  it('falls back to the slug when no name is stored', () => {
    const cards = getNewsCards({ ...base, card_slugs: ['a'] });
    expect(cards).toEqual([{ slug: 'a', name: 'a', image: null }]);
  });

  it('returns nothing for an item with no cards', () => {
    expect(getNewsCards(base)).toEqual([]);
    expect(getNewsCards(null)).toEqual([]);
  });
});
