import { expect, it } from 'vitest';
import { vitalsRoute } from './webVitals';
it('groups routes without retaining identifiers or search terms', () => {
  expect(vitalsRoute('/card/specific-card')).toBe('/card/:page');
  expect(vitalsRoute('/articles/author/person')).toBe('/articles/:page');
  expect(vitalsRoute('/private/user-id')).toBe('/other');
  expect(vitalsRoute('/')).toBe('/');
});
