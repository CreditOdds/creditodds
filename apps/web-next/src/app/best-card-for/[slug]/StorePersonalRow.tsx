'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { useAuth } from '@/auth/AuthProvider';
import { getWallet, type Card, type WalletCard } from '@/lib/api';
import type { Store } from '@/lib/stores';
import { rankCards, formatRate, type RankedPick } from '@/lib/storeRanking';

interface Props {
  store: Store;
  cards: Card[];
}

export default function StorePersonalRow({ store, cards }: Props) {
  const { authState, getToken } = useAuth();
  const [wallet, setWallet] = useState<WalletCard[] | null>(null);
  const [walletError, setWalletError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!authState.isAuthenticated) return;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const w = await getWallet(token);
        if (!cancelled) setWallet(w);
      } catch (err) {
        console.error('StorePersonalRow wallet fetch failed', err);
        if (!cancelled) setWalletError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authState.isAuthenticated, getToken]);

  // Auth still resolving — render nothing to avoid layout flash. The page is
  // statically generated so there's no SSR auth context to hydrate from.
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

  // Logged in but wallet hasn't loaded yet — render a quiet skeleton.
  if (!wallet && !walletError) {
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

  if (walletError || !wallet || wallet.length === 0) {
    return (
      <div className="store-personal-row store-personal-row--cta">
        <div className="store-personal-row-copy">
          <div className="store-personal-row-eyebrow">Your wallet</div>
          <div className="store-personal-row-cta-line">
            {wallet && wallet.length === 0 ? (
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

  // Join wallet rows → full Card objects so we can rank with rewards data.
  const cardsByName = new Map(cards.map((c) => [c.card_name, c]));
  const cardsByDbId = new Map(cards.map((c) => [Number(c.db_card_id ?? c.card_id), c]));
  const walletCards: Card[] = [];
  const seen = new Set<string>();
  for (const wc of wallet) {
    const card = cardsByDbId.get(wc.card_id) || cardsByName.get(wc.card_name);
    if (card && !seen.has(card.slug)) {
      walletCards.push(card);
      seen.add(card.slug);
    }
  }

  if (walletCards.length === 0) {
    return null;
  }

  // Rank wallet cards using the same logic as the global picks list, but with
  // floors lowered so a 1% Bilt card still surfaces if it's the best they own.
  const personalPicks = rankCards(store, walletCards, {
    flatRateFloor: 0,
    flatRateFillFloor: 0,
    maxPicks: 3,
  });

  if (personalPicks.length === 0) return null;

  return (
    <div className="store-personal-row">
      <div className="store-personal-row-eyebrow">From your wallet</div>
      <div className="store-personal-row-track">
        {personalPicks.map((pick, i) => (
          <PersonalCard key={pick.card.slug} pick={pick} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

function PersonalCard({ pick, rank }: { pick: RankedPick; rank: number }) {
  const rateLabel =
    pick.unit === 'points_per_dollar'
      ? `${pick.effectiveRate.toFixed(pick.effectiveRate < 10 ? 1 : 0)}%`
      : formatRate(pick.rate, pick.unit);
  const secondary = pick.unit === 'points_per_dollar' ? formatRate(pick.rate, pick.unit) : null;
  // Same caveat vocabulary as the main store-pick list:
  //   - rotating_current → "this quarter" (informational, purple)
  //   - rotating_eligible → "situational" (muted)
  //   - user_choice / top_spend → real condition (gold/warning)
  const badgeFlavor = pick.matchMode === 'rotating_current'
    ? ' is-period'
    : pick.matchMode === 'rotating_eligible'
    ? ' is-situational'
    : '';
  return (
    <Link href={`/card/${pick.card.slug}`} className="store-personal-row-card">
      <div className="store-personal-row-rank">#{rank}</div>
      <div className="store-personal-row-thumb">
        <CardImage
          cardImageLink={pick.card.card_image_link}
          alt=""
          width={56}
          height={36}
          style={{ width: 56, height: 36, objectFit: 'contain' }}
        />
      </div>
      <div className="store-personal-row-body">
        <div className="store-personal-row-name">{pick.card.card_name}</div>
        <div className="store-personal-row-rate">
          <span className="store-personal-row-rate-primary">
            {rateLabel}
            {pick.badge && <span className="store-personal-row-asterisk" aria-hidden="true">*</span>}
          </span>
          {secondary && <span className="store-personal-row-rate-secondary">{secondary}</span>}
        </div>
        {pick.badge && (
          <div className={`store-personal-row-badge${badgeFlavor}`}>{pick.badge}</div>
        )}
      </div>
    </Link>
  );
}
