'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { useAuth } from '@/auth/AuthProvider';
import { getStoreWalletPicks, type WalletPickRankedPick } from '@/lib/api';
import type { Store } from '@/lib/stores';
import { formatRate } from '@/lib/storeRanking';

interface Props {
  store: Store;
}

// Conditional matchModes: rate is contingent on user action or current
// quarter rotation, so they shouldn't compete head-to-head with always-on
// rates in the headline row.
function isConditional(p: WalletPickRankedPick): boolean {
  return (
    p.matchMode === 'top_spend' ||
    p.matchMode === 'user_choice' ||
    p.matchMode === 'rotating_eligible'
  );
}

export default function StorePersonalRow({ store }: Props) {
  const { authState, getToken } = useAuth();
  const [picks, setPicks] = useState<WalletPickRankedPick[] | null>(null);
  const [walletError, setWalletError] = useState(false);
  const [walletEmpty, setWalletEmpty] = useState(false);

  // Backend computes the wallet picks. We just render the response — no
  // local rankCards call, no full cards.json fetch.
  useEffect(() => {
    let cancelled = false;
    if (!authState.isAuthenticated) return;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const result = await getStoreWalletPicks(store.slug, token);
        if (cancelled) return;
        setPicks(result.picks);
        setWalletEmpty(result.picks.length === 0);
      } catch (err) {
        console.error('StorePersonalRow picks fetch failed', err);
        if (!cancelled) setWalletError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authState.isAuthenticated, getToken, store.slug]);

  if (authState.isLoading) return null;

  if (!authState.isAuthenticated) {
    return (
      <div className="store-personal-row store-personal-row--cta">
        <div className="store-personal-row-copy">
          <div className="store-personal-row-eyebrow">Your wallet</div>
          <div className="store-personal-row-cta-line">
            <Link href="/register" className="store-personal-row-cta-link">Sign up free</Link>{' '}
            and we'll show you the best card you already own to use at {store.name}.
          </div>
        </div>
      </div>
    );
  }

  if (picks === null && !walletError) {
    return (
      <div className="store-personal-row" aria-hidden="true">
        <div className="store-personal-row-eyebrow">From your wallet</div>
        <div className="store-personal-row-track">
          {[0, 1, 2].map((i) => (
            <div key={i} className="store-personal-row-card store-personal-row-card--skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (walletError || walletEmpty) {
    return (
      <div className="store-personal-row store-personal-row--cta">
        <div className="store-personal-row-copy">
          <div className="store-personal-row-eyebrow">Your wallet</div>
          <div className="store-personal-row-cta-line">
            {walletEmpty ? (
              <>
                Add cards to{' '}
                <Link href="/profile" className="store-personal-row-cta-link">your wallet</Link>{' '}
                and we'll surface your best pick for {store.name} here.
              </>
            ) : (
              <>
                Couldn't load your wallet. <Link href="/profile" className="store-personal-row-cta-link">View your wallet</Link>.
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!picks) return null;

  // Re-sort purely by effective rate (the backend's rankCards pins co-brand
  // at #1, which we explicitly don't want here — co-brand gets shown via
  // the divider slot if it doesn't earn its way into top 3).
  const sorted = [...picks].sort((a, b) => b.effectiveRate - a.effectiveRate);

  const unconditional = sorted.filter((p) => !isConditional(p));
  const conditional = sorted.filter(isConditional);

  const topUnconditional = unconditional.slice(0, 3);
  const coBrandPick = unconditional.find((p) => p.source === 'co_brand');
  const coBrandSeparate =
    coBrandPick && !topUnconditional.includes(coBrandPick) ? coBrandPick : null;

  const conditionalPicks = conditional.slice(0, 3);

  if (topUnconditional.length === 0 && conditionalPicks.length === 0) return null;

  return (
    <div className="store-personal-row">
      <div className="store-personal-row-eyebrow">From your wallet</div>

      {topUnconditional.length > 0 && (
        <div
          className={`store-personal-row-track${
            coBrandSeparate ? ' store-personal-row-track--has-cobrand' : ''
          }`}
        >
          {topUnconditional.map((pick, i) => (
            <PersonalCard key={pick.card.slug} pick={pick} rank={i + 1} />
          ))}
          {coBrandSeparate && (
            <div className="store-personal-row-cobrand-wrap">
              <PersonalCard pick={coBrandSeparate} rank={null} variant="cobrand" />
            </div>
          )}
        </div>
      )}

      {conditionalPicks.length > 0 && (
        <>
          <div className="store-personal-row-eyebrow store-personal-row-eyebrow--sub">
            Conditional rates
          </div>
          <div className="store-personal-row-track store-personal-row-track--compact">
            {conditionalPicks.map((pick) => (
              <PersonalCard
                key={pick.card.slug}
                pick={pick}
                rank={null}
                variant="compact"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface PersonalCardProps {
  pick: WalletPickRankedPick;
  rank: number | null;
  variant?: 'default' | 'cobrand' | 'compact';
}

function PersonalCard({ pick, rank, variant = 'default' }: PersonalCardProps) {
  const rateLabel =
    pick.unit === 'points_per_dollar'
      ? `${pick.effectiveRate.toFixed(pick.effectiveRate < 10 ? 1 : 0)}%`
      : formatRate(pick.rate, pick.unit);
  const secondary = pick.unit === 'points_per_dollar' ? formatRate(pick.rate, pick.unit) : null;
  const badgeFlavor =
    pick.matchMode === 'rotating_current'
      ? ' is-period'
      : pick.matchMode === 'rotating_eligible'
      ? ' is-situational'
      : '';
  const variantClass =
    variant === 'cobrand'
      ? ' store-personal-row-card--cobrand'
      : variant === 'compact'
      ? ' store-personal-row-card--compact'
      : '';
  return (
    <Link
      href={`/card/${pick.card.slug}`}
      className={`store-personal-row-card${variantClass}`}
    >
      {rank !== null ? (
        <div className="store-personal-row-rank">#{rank}</div>
      ) : variant === 'cobrand' ? (
        <div
          className="store-personal-row-rank store-personal-row-rank--brand"
          title="Co-branded card you own"
        >
          ★
        </div>
      ) : null}
      <div className="store-personal-row-thumb">
        <CardImage
          cardImageLink={pick.card.card_image_link}
          alt={pick.card.card_name}
          width={56}
          height={36}
          style={{ width: 56, height: 36, objectFit: 'contain' }}
        />
      </div>
      <div className="store-personal-row-body">
        <div className="store-personal-row-name">{pick.card.card_name}</div>
        <div className="store-personal-row-rate">
          <span className="store-personal-row-rate-primary">{rateLabel}</span>
          {secondary && (
            <span className="store-personal-row-rate-secondary">{secondary}</span>
          )}
        </div>
        {/* Top row only carries the "this quarter" tag (rotating_current) —
            other badges are reserved for the conditional row. Compact
            (conditional) row shows whatever badge the pick has. */}
        {pick.badge && (variant === 'compact' || pick.matchMode === 'rotating_current') && (
          <div className={`store-personal-row-badge${badgeFlavor}`}>{pick.badge}</div>
        )}
      </div>
    </Link>
  );
}
