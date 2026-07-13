'use client';

import { useEffect, useId, useState } from 'react';
import posthog from 'posthog-js';
import {
  ArrowTopRightOnSquareIcon,
  CalculatorIcon,
  CheckCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import type { StoreAffiliate } from '@/lib/stores';
import {
  AFFILIATE_EXPERIMENT_ID,
  AFFILIATE_EXPERIMENT_VARIANTS,
  assignAffiliateExperimentVariant,
  type AffiliateExperimentVariant,
} from '@/lib/affiliateExperiment';
import { trackStoreEvent } from '@/lib/api';

export type AffiliateExperimentPlacement = 'top' | 'after_first' | 'after_picks';

interface Props {
  storeName: string;
  storeSlug: string;
  affiliate: StoreAffiliate;
  topPickName?: string;
  topPickRateLabel?: string;
  topPickRewardRate?: number;
  placement: AffiliateExperimentPlacement;
}

const VISITOR_STORAGE_KEY = `creditodds:${AFFILIATE_EXPERIMENT_ID}:visitor`;
const exposureRegistry = new Map<string, { mounts: number; tracked: boolean; clicked: boolean }>();

function getVisitorId(): string {
  const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
  if (existing) return existing;

  const visitorId = typeof window.crypto?.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(VISITOR_STORAGE_KEY, visitorId);
  return visitorId;
}

function useExperimentVariant(storeSlug: string, enabled: boolean) {
  const [variant, setVariant] = useState<AffiliateExperimentVariant | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let assigned: AffiliateExperimentVariant;
    try {
      const developmentOverride = process.env.NODE_ENV === 'development'
        ? new URLSearchParams(window.location.search).get('affiliateExperiment')
        : null;
      assigned = AFFILIATE_EXPERIMENT_VARIANTS.includes(
        developmentOverride as AffiliateExperimentVariant,
      )
        ? developmentOverride as AffiliateExperimentVariant
        : assignAffiliateExperimentVariant(getVisitorId());
    } catch {
      // Storage can be disabled in privacy-focused browsing modes. A
      // per-session fallback still keeps every mounted placement consistent.
      const fallbackKey = '__creditoddsAffiliateExperimentVisitor';
      const experimentWindow = window as typeof window & Record<string, string | undefined>;
      experimentWindow[fallbackKey] ??= `${Date.now()}-${Math.random()}`;
      assigned = assignAffiliateExperimentVariant(experimentWindow[fallbackKey]);
    }
    setVariant(assigned);

    const current = exposureRegistry.get(storeSlug) ?? { mounts: 0, tracked: false, clicked: false };
    current.mounts += 1;
    exposureRegistry.set(storeSlug, current);

    if (!current.tracked) {
      current.tracked = true;
      trackStoreEvent('affiliate_impression', storeSlug, {
        experimentId: AFFILIATE_EXPERIMENT_ID,
        variant: assigned,
        placement: 'assigned',
      }).catch(() => {});
      posthog.capture('affiliate_experiment_viewed', {
        experiment_id: AFFILIATE_EXPERIMENT_ID,
        store_slug: storeSlug,
        variant: assigned,
      });
    }

    return () => {
      const registered = exposureRegistry.get(storeSlug);
      if (!registered) return;
      registered.mounts -= 1;
      if (registered.mounts === 0) {
        window.setTimeout(() => {
          if (exposureRegistry.get(storeSlug)?.mounts === 0) {
            exposureRegistry.delete(storeSlug);
          }
        }, 0);
      }
    };
  }, [enabled, storeSlug]);

  return variant;
}

function affiliateLabel(storeName: string, affiliate: StoreAffiliate): string {
  return affiliate.cta
    ?? (affiliate.offer
      ? `See ${affiliate.offer} at ${storeName}`
      : `Shop at ${storeName}`);
}

function AffiliateLink({
  storeName,
  storeSlug,
  affiliate,
  topPickName,
  variant,
  placement,
  className,
  children,
}: Omit<Props, 'placement'> & {
  variant?: AffiliateExperimentVariant;
  placement: 'top' | 'after_first' | 'after_picks' | 'sticky';
  className: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={affiliate.url}
      target="_blank"
      rel="sponsored nofollow noopener noreferrer"
      className={className}
      onClick={() => {
        const exposure = exposureRegistry.get(storeSlug);
        const shouldAttributeClick = Boolean(variant && exposure && !exposure.clicked);
        if (shouldAttributeClick && exposure) exposure.clicked = true;
        trackStoreEvent('affiliate_click', storeSlug, shouldAttributeClick && variant ? {
          experimentId: AFFILIATE_EXPERIMENT_ID,
          variant,
          placement,
        } : undefined).catch(() => {});
        posthog.capture('affiliate_link_clicked', {
          store_slug: storeSlug,
          store_name: storeName,
          network: affiliate.network,
          top_pick: topPickName,
          offer: affiliate.offer ?? null,
          experiment_id: variant ? AFFILIATE_EXPERIMENT_ID : null,
          experiment_variant: variant ?? null,
          experiment_placement: placement,
        });
      }}
    >
      {children}
    </a>
  );
}

function ControlCta(props: Props & { variant?: AffiliateExperimentVariant }) {
  const { storeName, affiliate, placement, variant } = props;
  const label = affiliateLabel(storeName, affiliate);
  const words = label.trim().split(/\s+/);
  const tail = words.pop() ?? '';
  const head = words.join(' ');
  const titleId = useId();

  return (
    <aside className="store-affiliate" aria-labelledby={titleId}>
      <div className="store-affiliate-body">
        <h2 id={titleId} className="store-affiliate-title">
          Shopping at {storeName}?
        </h2>
      </div>
      <AffiliateLink
        {...props}
        variant={variant}
        placement={placement === 'after_first' ? 'after_first' : placement}
        className="store-affiliate-btn"
      >
        {head && `${head} `}
        <span className="store-affiliate-btn-tail">
          {tail}
          <ArrowTopRightOnSquareIcon className="store-affiliate-btn-icon" aria-hidden="true" />
        </span>
      </AffiliateLink>
    </aside>
  );
}

function CheckoutPlan(props: Props & { variant: AffiliateExperimentVariant }) {
  const { storeName, affiliate, topPickName, topPickRateLabel, variant } = props;
  return (
    <li className="store-affiliate-experiment-item">
      <aside className="store-affiliate-plan" aria-label={`Checkout plan for ${storeName}`}>
        <CheckCircleIcon className="store-affiliate-plan-icon" aria-hidden="true" />
        <div className="store-affiliate-plan-body">
          <div className="store-affiliate-plan-kicker">Your checkout plan</div>
          <div className="store-affiliate-plan-title">
            Use <strong>{topPickName}</strong>
            {topPickRateLabel ? <> to earn <strong>{topPickRateLabel}</strong></> : null}.
          </div>
          {affiliate.offer && (
            <div className="store-affiliate-plan-offer">
              Merchant offer: {affiliate.offer}.
            </div>
          )}
        </div>
        <AffiliateLink {...props} variant={variant} placement="after_first" className="store-affiliate-btn">
          Continue to {storeName}
          <ArrowTopRightOnSquareIcon className="store-affiliate-btn-icon" aria-hidden="true" />
        </AffiliateLink>
      </aside>
    </li>
  );
}

function RewardCalculator(props: Props & { variant: AffiliateExperimentVariant }) {
  const { storeName, topPickName, topPickRewardRate = 0, variant } = props;
  const [spend, setSpend] = useState(250);
  const rewardValue = Math.max(0, spend) * topPickRewardRate / 100;
  const rewardLabel = rewardValue.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: rewardValue >= 10 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  return (
    <li className="store-affiliate-experiment-item">
      <aside className="store-affiliate-calculator" aria-label={`Rewards estimate for ${storeName}`}>
        <div className="store-affiliate-calculator-head">
          <CalculatorIcon className="store-affiliate-plan-icon" aria-hidden="true" />
          <div>
            <div className="store-affiliate-plan-kicker">What will you spend?</div>
            <div className="store-affiliate-plan-title">
              <strong>{topPickName}</strong> earns about <strong>{rewardLabel}</strong> in rewards.
            </div>
          </div>
        </div>
        <div className="store-affiliate-calculator-controls">
          <label className="store-affiliate-spend-input">
            <span>$</span>
            <input
              type="number"
              min="0"
              max="100000"
              step="10"
              value={spend}
              onChange={(event) => setSpend(Number(event.target.value) || 0)}
              aria-label="Planned purchase amount"
            />
          </label>
          <div className="store-affiliate-spend-chips" aria-label="Suggested purchase amounts">
            {[50, 100, 250, 500].map(amount => (
              <button
                key={amount}
                type="button"
                className={spend === amount ? 'is-active' : ''}
                onClick={() => setSpend(amount)}
              >
                ${amount}
              </button>
            ))}
          </div>
          <AffiliateLink {...props} variant={variant} placement="after_first" className="store-affiliate-btn">
            Shop {storeName}
            <ArrowTopRightOnSquareIcon className="store-affiliate-btn-icon" aria-hidden="true" />
          </AffiliateLink>
        </div>
        <div className="store-affiliate-estimate-note">
          Estimate uses the top pick&apos;s effective reward value; actual rewards can vary.
        </div>
      </aside>
    </li>
  );
}

function StickyCheckout(props: Props & { variant: AffiliateExperimentVariant }) {
  const { storeName, topPickRateLabel, variant } = props;
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const topPick = document.getElementById('store-top-pick');
    if (!topPick) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(topPick);
    return () => observer.disconnect();
  }, []);

  if (!visible || dismissed) return null;
  return (
    <aside className="store-affiliate-sticky" aria-label={`Shop at ${storeName}`}>
      <div className="store-affiliate-sticky-copy">
        <strong>{storeName}</strong>
        <span>{topPickRateLabel ? `Top card earns ${topPickRateLabel}` : 'Ready to shop?'}</span>
      </div>
      <AffiliateLink {...props} variant={variant} placement="sticky" className="store-affiliate-sticky-btn">
        Shop now
        <ArrowTopRightOnSquareIcon aria-hidden="true" />
      </AffiliateLink>
      <button
        type="button"
        className="store-affiliate-sticky-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss checkout bar"
      >
        <XMarkIcon aria-hidden="true" />
      </button>
    </aside>
  );
}

export default function StoreAffiliateExperiment(props: Props) {
  const enabled = Boolean(props.topPickName);
  const variant = useExperimentVariant(props.storeSlug, enabled);

  if (!enabled) {
    return props.placement === 'top' ? <ControlCta {...props} /> : null;
  }
  if (!variant) return null;

  if (variant === 'control') {
    return props.placement === 'top' || props.placement === 'after_picks'
      ? <ControlCta {...props} variant={variant} />
      : null;
  }
  if (variant === 'checkout_plan') {
    return props.placement === 'after_first'
      ? <CheckoutPlan {...props} variant={variant} />
      : null;
  }
  if (variant === 'reward_calculator') {
    return props.placement === 'after_first'
      ? <RewardCalculator {...props} variant={variant} />
      : null;
  }
  return props.placement === 'top'
    ? <StickyCheckout {...props} variant={variant} />
    : null;
}
