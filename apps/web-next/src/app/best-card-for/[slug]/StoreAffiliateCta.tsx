'use client';

import posthog from 'posthog-js';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/solid';
import type { StoreAffiliate } from '@/lib/stores';

interface Props {
  storeName: string;
  storeSlug: string;
  affiliate: StoreAffiliate;
  /** Name of the #1 ranked card, used to make the prompt concrete. */
  topPickName?: string;
}

export default function StoreAffiliateCta({
  storeName,
  storeSlug,
  affiliate,
  topPickName,
}: Props) {
  // Lead with the merchant's own offer when there is one — "See 10 free meals
  // at HelloFresh" earns the click on substance. Never frame it as a
  // CreditOdds discount: we take a commission, we don't change the price.
  const label =
    affiliate.cta ??
    (affiliate.offer
      ? `See ${affiliate.offer} at ${storeName}`
      : `See exclusive discounts at ${storeName}`);

  // Keep the arrow welded to the final word. Without this, a label that wraps
  // (narrow screens, long store names) can strand the arrow alone on its own
  // line. Tail = last word + icon, held together with white-space: nowrap.
  const words = label.trim().split(/\s+/);
  const tail = words.pop() ?? '';
  const head = words.join(' ');

  return (
    <aside className="store-affiliate" aria-labelledby="store-affiliate-title">
      <div className="store-affiliate-body">
        <h2 id="store-affiliate-title" className="store-affiliate-title">
          Shopping at {storeName}?
        </h2>
        <p className="store-affiliate-disclosure">
          {affiliate.offer && `Offer shown as listed by ${storeName}, and subject to change. `}
          CreditOdds may earn a commission on purchases made through this link. It never
          affects how we rank cards.
        </p>
      </div>

      <a
        href={affiliate.url}
        target="_blank"
        rel="sponsored nofollow noopener noreferrer"
        className="store-affiliate-btn"
        onClick={() =>
          posthog.capture('affiliate_link_clicked', {
            store_slug: storeSlug,
            store_name: storeName,
            network: affiliate.network,
            top_pick: topPickName,
            offer: affiliate.offer ?? null,
          })
        }
      >
        {head && `${head} `}
        <span className="store-affiliate-btn-tail">
          {tail}
          <ArrowTopRightOnSquareIcon className="store-affiliate-btn-icon" aria-hidden="true" />
        </span>
      </a>
    </aside>
  );
}
