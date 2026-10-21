// Node-only catalog access. One async parse/index per process in production;
// refresh in development so locally rebuilt YAML data is picked up.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CardBenefit } from './api';

let index: Promise<Map<string, CardBenefit[]>> | undefined;
let expiresAt = 0;
export async function getLocalCardBenefits(slug: string): Promise<CardBenefit[] | undefined> {
  if (!index || Date.now() >= expiresAt) {
    expiresAt = process.env.NODE_ENV === 'development' ? Date.now() + 1000 : Infinity;
    index = readFile(join(process.cwd(), '../../data/cards.json'), 'utf8').then(raw => {
      const data = JSON.parse(raw) as { cards: { slug: string; benefits?: CardBenefit[] }[] };
      return new Map(data.cards.filter(c => c.benefits).map(c => [c.slug, c.benefits!]));
    }).catch(error => { index = undefined; throw error; });
  }
  return (await index).get(slug);
}
