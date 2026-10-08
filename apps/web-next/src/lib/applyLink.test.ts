import { describe, expect, it } from 'vitest';
import { cardApplyHref } from './applyLink';

const ISSUER_URL = 'https://creditcards.wellsfargo.com/reflect-visa-credit-card';
const SPECIAL_URL = 'https://www.fidelity.com/go/visa-signature-rewards-1502';
const AFFILIATE_URL =
  'https://track.acclaimnetwork.com/apn/click?b2s=302211&SUBID=PARAM&praff=5747';

describe('cardApplyHref', () => {
  it('sends the button to the affiliate link verbatim when one is set', () => {
    expect(cardApplyHref({
      apply_link: ISSUER_URL,
      special_apply_link: SPECIAL_URL,
      affiliate_link: AFFILIATE_URL,
    })).toBe(AFFILIATE_URL);
  });

  it('falls back to special_apply_link, then apply_link, with UTM tags', () => {
    const special = cardApplyHref({ apply_link: ISSUER_URL, special_apply_link: SPECIAL_URL });
    expect(special).toContain('fidelity.com/go/visa-signature-rewards-1502');
    expect(special).toContain('utm_source=creditodds');

    const direct = cardApplyHref({ apply_link: ISSUER_URL });
    expect(direct).toContain('creditcards.wellsfargo.com/reflect-visa-credit-card');
    expect(direct).toContain('utm_source=creditodds');
  });

  it('returns undefined when the card has no link', () => {
    expect(cardApplyHref({})).toBeUndefined();
  });
});
