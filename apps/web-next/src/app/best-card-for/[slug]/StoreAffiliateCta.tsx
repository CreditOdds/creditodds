'use client';

import { useId, useState } from 'react';
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
  const [bannerFailed, setBannerFailed] = useState(false);

  // The second placement only makes sense underneath a ranked list, so it is
  // suppressed on stores that produced no picks.
  if (placement === 'after_picks' && !topPickName) return null;

  // Only a minority of merchants ship an evergreen banner, and an ad blocker or
  // a dead CDN can still take one out at runtime, so the text CTA stays the
  // fallback in both cases. `creative_type` is what makes the two comparable in
  // PostHog — without it a banner click and a button click are indistinguishable.
  const banner = bannerFailed ? undefined : affiliate.banner;

  const track = (creativeType: 'banner' | 'text') => {
    trackStoreEvent('affiliate_click', storeSlug).catch(() => {});
    posthog.capture('affiliate_link_clicked', {
      store_slug: storeSlug,
      store_name: storeName,
      network: affiliate.network,
      top_pick: topPickName,
      offer: affiliate.offer ?? null,
      placement,
      creative_type: creativeType,
    });
  };

  return (
    <aside className="store-affiliate" aria-labelledby={titleId}>
      <div className="store-affiliate-body">
        <h2 id={titleId} className="store-affiliate-title">
          Shopping at {storeName}?
        </h2>
      </div>
      {banner ? (
        <a
          href={affiliate.url}
          target="_blank"
          rel="sponsored nofollow noopener noreferrer"
          className="store-affiliate-banner"
          onClick={() => track('banner')}
        >
          {/* A plain <img> rather than next/image: these are third-party ad
              creatives on rotating CDNs, so they cannot be optimised at build
              time and should not be proxied through our image route. width and
              height are always present, which reserves the box and keeps the
              banner from shifting the page as it loads. */}
          <img
            src={banner.image}
            width={banner.width}
            height={banner.height}
            alt={`${storeName} advertisement`}
            loading="lazy"
            decoding="async"
            onError={() => setBannerFailed(true)}
            // React 18 does not replay an error that fired before hydration,
            // and the top banner starts loading with the HTML, so a fast 404
            // can beat the handler. A complete image with no pixels has failed.
            ref={(img) => {
              if (img?.complete && img.naturalWidth === 0) setBannerFailed(true);
            }}
          />
        </a>
      ) : (
        <a
          href={affiliate.url}
          target="_blank"
          rel="sponsored nofollow noopener noreferrer"
          className="store-affiliate-btn"
          onClick={() => track('text')}
        >
          {head && `${head} `}
          <span className="store-affiliate-btn-tail">
            {tail}
            <ArrowTopRightOnSquareIcon className="store-affiliate-btn-icon" aria-hidden="true" />
          </span>
        </a>
      )}
    </aside>
  );
}
