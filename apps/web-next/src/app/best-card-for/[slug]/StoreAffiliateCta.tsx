'use client';

import { useId } from 'react';
import posthog from 'posthog-js';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/solid';
import type { StoreAffiliate } from '@/lib/stores';
import { trackStoreEvent } from '@/lib/api';

export type AffiliateCtaPlacement = 'top' | 'after_picks';

interface Props {
  storeName: string;
  storeSlug: string;
  affiliate: StoreAffiliate;
  topPickName?: string;
  placement: AffiliateCtaPlacement;
}

function affiliateLabel(storeName: string, affiliate: StoreAffiliate): string {
  return affiliate.cta
    ?? (affiliate.offer
      ? `See ${affiliate.offer} at ${storeName}`
      : `Shop at ${storeName}`);
}

export default function StoreAffiliateCta(props: Props) {
  const { storeName, storeSlug, affiliate, topPickName, placement } = props;
  const label = affiliateLabel(storeName, affiliate);
  const words = label.trim().split(/\s+/);
  const tail = words.pop() ?? '';
  const head = words.join(' ');
  const titleId = useId();

  // The second placement only makes sense underneath a ranked list, so it is
  // suppressed on stores that produced no picks.
  if (placement === 'after_picks' && !topPickName) return null;

  return (
    <aside className="store-affiliate" aria-labelledby={titleId}>
      <div className="store-affiliate-body">
        <h2 id={titleId} className="store-affiliate-title">
          Shopping at {storeName}?
        </h2>
      </div>
      <a
        href={affiliate.url}
        target="_blank"
        rel="sponsored nofollow noopener noreferrer"
        className="store-affiliate-btn"
        onClick={() => {
          trackStoreEvent('affiliate_click', storeSlug).catch(() => {});
          posthog.capture('affiliate_link_clicked', {
            store_slug: storeSlug,
            store_name: storeName,
            network: affiliate.network,
            top_pick: topPickName,
            offer: affiliate.offer ?? null,
            placement,
          });
        }}
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
