'use client';

import { Fragment, useMemo, useState } from 'react';
import CardImage from '@/components/ui/CardImage';
import { Card, NearbyPlace, WalletCard, getNearbyPlaces } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { categoryLabels } from '@/lib/cardDisplayUtils';
import { mapPlaceToCategory } from '@/lib/placeTypeMapping';
import { pickWalletCardsForCategory, WalletPick } from '@/lib/walletPicksForCategory';

// Resolved merchant ready for rendering: a place from the API plus the
// lowercase reward category id it maps to (matches Reward.category in
// data/cards/* YAML).
interface Merchant {
  id: string;
  name: string;
  cat: string;
  catLabel: string;
  dist: string;
  addr: string;
}

function metersToMiles(m: number): string {
  const mi = m / 1609.34;
  if (mi < 0.1) return '<0.1 mi';
  return `${mi.toFixed(1)} mi`;
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Categories the user might never spend on at all (e.g. transit/airlines)
// can still surface a row using the user's everything_else baseline, so we
// no longer reject merchants by category here. Drop only the unmapped
// fallback (everything_else) — those are too generic to be useful.
function placesToMerchants(places: NearbyPlace[], userLat: number, userLng: number): Merchant[] {
  return places
    .map((p) => {
      const match = mapPlaceToCategory({
        name: p.name,
        primaryType: p.primaryType ?? undefined,
        types: p.types,
      });
      if (match.category === 'everything_else') return null;
      const dist = p.lat != null && p.lng != null
        ? metersToMiles(haversineMeters(userLat, userLng, p.lat, p.lng))
        : '—';
      const catLabel = categoryLabels[match.category]?.toLowerCase() ?? match.category;
      return {
        id: p.id,
        name: p.name,
        cat: match.category,
        catLabel,
        dist,
        addr: p.address?.split(',')[0] ?? '',
      } satisfies Merchant;
    })
    .filter((m): m is Merchant => m !== null)
    .sort((a, b) => {
      const av = parseFloat(a.dist);
      const bv = parseFloat(b.dist);
      if (Number.isNaN(av)) return 1;
      if (Number.isNaN(bv)) return -1;
      return av - bv;
    });
}


interface Location {
  label: string;
  coords: string;
  accuracy: number;
}

function BetaPill() {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      borderRadius: 3,
      background: 'var(--accent)',
      color: '#fff',
      verticalAlign: 'middle',
    }}>BETA</span>
  );
}

interface LocationBlockProps {
  location: Location | null;
  cardsCount: number;
  onEnable: () => void;
  onClear: () => void;
}

function LocationBlock({ location, cardsCount, onEnable, onClear }: LocationBlockProps) {
  if (!location) {
    return (
      <div style={{
        marginTop: 10,
        padding: '20px 22px',
        border: '1px solid var(--line-2)',
        background: 'var(--paper-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
            Use your location to find the best card to swipe
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5, maxWidth: '52ch' }}>
            We&apos;ll look up nearby businesses and cross-reference your {cardsCount} card{cardsCount === 1 ? '' : 's'} to surface
            the highest earn at each merchant. Your location is used in-session and never stored.
          </div>
        </div>
        <button
          type="button"
          className="cj-inline-cta"
          style={{ padding: '8px 14px', fontSize: 12 }}
          onClick={onEnable}
        >
          enable location
        </button>
      </div>
    );
  }
  return (
    <div style={{
      marginTop: 10,
      padding: '12px 16px',
      border: '1px solid var(--line-2)',
      background: 'var(--paper)',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      fontSize: 12.5,
      flexWrap: 'wrap',
    }}>
      <span style={{
        display: 'inline-block',
        width: 7, height: 7,
        borderRadius: '50%',
        background: '#1f8a5b',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{location.label}</span>
        <span style={{ color: 'var(--muted)', marginLeft: 10 }}>
          {location.coords} · accuracy ±{location.accuracy}m
        </span>
      </div>
      <button
        type="button"
        onClick={onClear}
        style={{
          background: 'transparent', border: 0, font: 'inherit',
          fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer',
          letterSpacing: '0.02em', padding: 0,
        }}
      >
        update location
      </button>
    </div>
  );
}

function PickThumb({ card }: { card: Card }) {
  return (
    <span className="cj-rew-thumb">
      <CardImage cardImageLink={card.card_image_link} alt={card.card_name} fill sizes="32px" className="object-contain" />
    </span>
  );
}

function PickDetail({ label, pick }: { label: string; pick: WalletPick }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <PickThumb card={pick.card} />
        <div>
          <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{pick.card.card_name}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{pick.rateLabel} {pick.context}</div>
        </div>
      </div>
    </div>
  );
}

interface BestCardHereProps {
  walletCards: WalletCard[];
  allCards: Card[];
}

export default function BestCardHere({ walletCards, allCards }: BestCardHereProps) {
  const { getToken } = useAuth();
  const [location, setLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const cardsCount = walletCards.length;

  const enable = async () => {
    setErrorMessage(null);
    setOpenIdx(null);

    if (!('geolocation' in navigator)) {
      setErrorMessage('Your browser does not support location lookup.');
      return;
    }

    setLoading(true);

    let coords: GeolocationCoordinates;
    try {
      coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
        );
      });
    } catch (e) {
      setLoading(false);
      const msg = e instanceof GeolocationPositionError && e.code === 1
        ? 'Location permission denied. Allow location access to see nearby merchants.'
        : 'Could not determine your location. Try again in a moment.';
      setErrorMessage(msg);
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        setLoading(false);
        setErrorMessage('You need to be signed in to use this feature.');
        return;
      }
      const result = await getNearbyPlaces(coords.latitude, coords.longitude, token);
      const resolved = placesToMerchants(result.places, coords.latitude, coords.longitude);
      setMerchants(resolved);
      setLocation({
        label: 'Your location',
        coords: `${coords.latitude.toFixed(4)}° ${coords.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(coords.longitude).toFixed(4)}° ${coords.longitude >= 0 ? 'E' : 'W'}`,
        accuracy: Math.round(coords.accuracy),
      });
      setLoading(false);
    } catch (e) {
      setLoading(false);
      setErrorMessage(e instanceof Error ? e.message : 'Failed to load nearby merchants.');
    }
  };

  const clear = () => {
    setLocation(null);
    setMerchants([]);
    setOpenIdx(null);
    setErrorMessage(null);
  };

  const showList = location && !loading;

  // Resolve picks once so the empty state accurately reflects "no wallet
  // match," not just "no merchants returned."
  const merchantPicks = useMemo(() => {
    return merchants
      .map((m) => {
        const picks = pickWalletCardsForCategory(walletCards, allCards, m.cat);
        return picks ? { merchant: m, picks } : null;
      })
      .filter((x): x is { merchant: Merchant; picks: { best: WalletPick; next?: WalletPick } } => x !== null);
  }, [merchants, walletCards, allCards]);

  return (
    <div style={{ paddingBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <BetaPill />
        <h2 className="cj-section-h2" style={{ margin: 0, fontSize: 26 }}>
          Best card <em className="cj-section-accent">here.</em>
        </h2>
        <span className="cj-section-num" style={{ marginLeft: 'auto' }}>
          pilot · <a href="#" style={{ color: 'var(--accent)', textDecoration: 'none' }}>send feedback →</a>
        </span>
      </div>
      <p style={{
        margin: '8px 0 0',
        fontSize: 13,
        color: 'var(--ink-2)',
        lineHeight: 1.6,
        maxWidth: '64ch',
      }}>
        We&apos;re piloting a wallet-aware merchant lookup. Share your location and we&apos;ll show
        the 5–12 closest businesses with the single best card from your wallet to swipe at each one.
        We won&apos;t store coordinates and we won&apos;t follow you home.
      </p>

      <LocationBlock
        location={location}
        cardsCount={cardsCount}
        onEnable={enable}
        onClear={clear}
      />

      {loading && (
        <div style={{
          marginTop: 24,
          padding: '40px 0',
          textAlign: 'center',
          color: 'var(--muted)',
          fontSize: 12.5,
          letterSpacing: '0.02em',
        }}>
          locating · scanning nearby merchants…
        </div>
      )}

      {errorMessage && !loading && (
        <div className="cj-verdict" style={{ marginTop: 16, background: '#fef9e8', borderLeftColor: '#a8792a', color: '#5c4318' }}>
          <b style={{ color: '#a8792a' }}>{errorMessage}</b>
          <div style={{ marginTop: 8 }}>
            <button type="button" className="cj-inline-cta" onClick={enable}>try again</button>
          </div>
        </div>
      )}

      {showList && cardsCount === 0 && (
        <div className="cj-verdict" style={{ marginTop: 16 }}>
          <b>Add cards to your wallet first.</b> Best Card Here recommends from your held cards — there&apos;s nothing to match against yet.
        </div>
      )}

      {showList && cardsCount > 0 && merchantPicks.length === 0 && (
        <div className="cj-verdict" style={{ marginTop: 16 }}>
          No nearby merchants matched a reward category for the cards in your wallet. Try a different spot, or add a card with broader earn categories.
        </div>
      )}

      {showList && merchantPicks.length > 0 && (
        <>
          <div className="cj-table-label" style={{ marginTop: 24 }}>
            {merchantPicks.length} merchant{merchantPicks.length === 1 ? '' : 's'} nearby · sorted by distance
          </div>
          <div className="cj-tape cj-tape-bch">
            <div className="cj-tape-head cj-bch-head">
              <div className="cj-bch-dist">Dist.</div>
              <div className="cj-bch-merchant">Merchant</div>
              <div className="cj-bch-cat">Category</div>
              <div className="cj-bch-best">Best</div>
              <div className="cj-bch-next">Runner-up</div>
              <div className="cj-tape-res cj-bch-earn">Earn</div>
            </div>
            {merchantPicks.map(({ merchant: m, picks }, i) => {
              const isOpen = openIdx === i;
              const best = picks.best;
              const next = picks.next;

              return (
                <Fragment key={`${m.id}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                    className={'cj-tape-row cj-bch-row' + (isOpen ? ' is-open' : '')}
                    aria-expanded={isOpen}
                  >
                    <div className="cj-tape-when cj-bch-dist" style={{ fontVariantNumeric: 'tabular-nums' }}>{m.dist}</div>
                    <div className="cj-tape-event cj-bch-merchant">
                      <span className="cj-tape-field">{m.name}</span>
                      <div className="cj-tape-detail">
                        <span className="cj-bch-addr">{m.addr}</span>
                        <span className="cj-bch-mob-meta"> · {m.catLabel} · {m.dist}</span>
                      </div>
                    </div>
                    <div className="cj-tape-when cj-bch-cat" style={{ fontSize: 11 }}>{m.catLabel}</div>
                    <div className="cj-bch-card cj-bch-best">
                      <PickThumb card={best.card} />
                      <div className="cj-bch-card-text">
                        <div className="cj-cell-primary">{best.card.card_name}</div>
                        <div className="cj-cell-detail">{best.rateLabel} {best.context}</div>
                      </div>
                    </div>
                    <div className="cj-bch-card cj-bch-next">
                      {next ? (
                        <>
                          <PickThumb card={next.card} />
                          <div className="cj-bch-card-text">
                            <div className="cj-cell-primary">{next.card.card_name}</div>
                            <div className="cj-cell-detail">{next.rateLabel} {next.context}</div>
                          </div>
                        </>
                      ) : (
                        <div className="cj-cell-detail" style={{ opacity: 0.7 }}>—</div>
                      )}
                    </div>
                    <div className="cj-tape-res cj-bch-earn">
                      <span className="cj-eff-pct cj-bch-earn-val">{best.rateLabel}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="cj-bch-detail">
                      <div className="cj-bch-detail-grid">
                        <PickDetail label="Best" pick={best} />
                        {next && <PickDetail label="Runner-up" pick={next} />}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="cj-wd-cta">add to apple wallet</button>
                        {best.card.slug && (
                          <a href={`/card/${best.card.slug}`} style={{
                            fontSize: 11.5, color: 'var(--ink-2)', textDecoration: 'none',
                            background: 'var(--paper)', border: '1px solid var(--line-2)',
                            borderRadius: 3, padding: '5px 9px', letterSpacing: '0.02em',
                          }}>see {best.card.card_name} rules →</a>
                        )}
                        <a href="#" style={{
                          fontSize: 11.5, color: 'var(--muted)', textDecoration: 'none', padding: '5px 4px',
                        }}>not the right category? report</a>
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>

          <div className="cj-verdict" style={{ marginTop: 18 }}>
            <b>Pilot note.</b> Best-card matching is computed against the {cardsCount} card{cardsCount === 1 ? '' : 's'}
            {' '}currently in your wallet and each card&apos;s published earn rules. Quarterly rotating categories
            (Freedom Flex, Discover) are not yet considered.{' '}
            <a href="#" style={{ color: 'var(--accent)' }}>Tell us what&apos;s missing →</a>
          </div>
        </>
      )}
    </div>
  );
}
