// Reserved for a confirmed 404 from the single-card API. Catalog outages and
// malformed responses must propagate to Next's error boundary / ISR retry.
export class CardNotFoundError extends Error {
  constructor() {
    super('Card not found');
    this.name = 'CardNotFoundError';
  }
}
