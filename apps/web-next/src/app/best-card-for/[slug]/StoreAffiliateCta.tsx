'use client';

import { useId, useRef, useState } from 'react';
import posthog from 'posthog-js';
import { ArrowTopRightOnSquareIcon, CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/solid';
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
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  // The second placement only makes sense underneath a ranked list, so it is
  // suppressed on stores that produced no picks.
  if (placement === 'after_picks' && !topPickName) return null;

  // Only a minority of merchants ship an evergreen banner, and an ad blocker or
  // a dead CDN can still take one out at runtime, so the text CTA stays the
  // fallback in both cases. `creative_type` is what makes the two comparable in
  // PostHog — without it a banner click and a button click are indistinguishable.
  const banner = bannerFailed ? undefined : affiliate.banner;

  const track = (creativeType: 'banner' | 'text' | 'code') => {
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

  // Code-only variant: the program issues a referral code and no link, so
  // there is nothing to send the reader to. The code is plain selectable text
  // (the copy button is a convenience, and the clipboard API is unavailable on
  // insecure origins and in some in-app browsers), and a copy counts as the
  // click for tracking. Unlike a tracking link, a referral code pays us in
  // kind, so the disclosure sits in the panel itself.
  const { code, url } = affiliate;
  if (!url) {
    if (!code) return null;
    const copyCode = async () => {
      track('code');
      let ok = false;
      try {
        await navigator.clipboard.writeText(code);
        ok = true;
      } catch {
        // Clipboard API refused (permission denied, insecure origin, in-app
        // browser). Select the code and try the legacy command; even if that
        // fails too, the code is left highlighted, one Ctrl/Cmd+C from copied.
        const el = codeRef.current;
        const selection = window.getSelection();
        if (el && selection) {
          const range = document.createRange();
          range.selectNodeContents(el);
          selection.removeAllRanges();
          selection.addRange(range);
          try {
            ok = document.execCommand('copy');
          } catch {
            ok = false;
          }
        }
      }
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    };
    return (
      <aside className="store-affiliate store-affiliate-has-code" aria-labelledby={titleId}>
        <div className="store-affiliate-body">
          <h2 id={titleId} className="store-affiliate-title">
            Signing up for {storeName}?
          </h2>
          <p className="store-affiliate-note">
            Enter this referral code at sign-up{affiliate.offer ? ` and you get ${affiliate.offer}` : ''}.
            CreditOdds gets a referral credit too.
          </p>
        </div>
        <div className="store-affiliate-code">
          <code ref={codeRef} className="store-affiliate-code-value">{code}</code>
          <button type="button" className="store-affiliate-code-copy" onClick={copyCode}>
            {copied
              ? <CheckIcon className="store-affiliate-code-icon" aria-hidden="true" />
              : <ClipboardDocumentIcon className="store-affiliate-code-icon" aria-hidden="true" />}
            <span aria-live="polite">{copied ? 'Copied' : 'Copy code'}</span>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="store-affiliate" aria-labelledby={titleId}>
      <div className="store-affiliate-body">
        <h2 id={titleId} className="store-affiliate-title">
          Shopping at {storeName}?
        </h2>
      </div>
      {banner ? (
        <a
          href={url}
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
          href={url}
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
