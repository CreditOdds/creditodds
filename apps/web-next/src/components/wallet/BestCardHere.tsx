'use client';

import { Fragment, useState } from 'react';
import CardImage from '@/components/ui/CardImage';
import { Card, NearbyPlace, WalletCard, getNearbyPlaces } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { mapPlaceToCategory } from '@/lib/placeTypeMapping';

// Resolved merchant ready for rendering: a place from the API plus the
// PICKS-key category (Title Case) it maps to.
interface Merchant {
  id: string;
  name: string;
  cat: string;
  dist: string;
  addr: string;
}

// Bridges placeTypeMapping's lowercase ids ("dining", "groceries", "gas")
// to the Title-Case keys used by the curated PICKS lookup below. Anything
// not in this map falls through (we hide the merchant rather than show a
// blank recommendation).
const CATEGORY_BRIDGE: Record<string, string> = {
  dining: 'Dining',
  groceries: 'US groceries',
  gas: 'Gas',
  drugstores: 'Drugstores',
  hotels: 'Hotels',
  entertainment: 'Entertainment',
  // The Places API doesn't have a "rideshare" type — fold transit into
  // the same bucket so taxi stands / transit hubs surface a card too.
  transit: 'Rideshare',
};

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

function placesToMerchants(places: NearbyPlace[], userLat: number, userLng: number): Merchant[] {
  return places
    .map((p) => {
      const match = mapPlaceToCategory({
        name: p.name,
        primaryType: p.primaryType ?? undefined,
        types: p.types,
      });
      const cat = CATEGORY_BRIDGE[match.category];
      if (!cat) return null;
      const dist = p.lat != null && p.lng != null
        ? metersToMiles(haversineMeters(userLat, userLng, p.lat, p.lng))
        : '—';
      return {
        id: p.id,
        name: p.name,
        cat,
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

// Hand-curated category → card recommendation lookup. Card names match
// real cards in the codebase so they resolve against the global card list
// (see `findCardByMatch` below). Adding a card here is a content change,
// not new card data — the cards themselves still live in data/cards/.
interface PickEntry {
  match: string;          // case-insensitive substring used to look up the real card
  displayName: string;    // what we show in the row
  rate: string;           // headline earn for this category, e.g. "4x dining"
}
interface CategoryPicks {
  best: PickEntry;
  next: PickEntry;
}
const PICKS: Record<string, CategoryPicks> = {
  'Dining': {
    best: { match: 'gold card',          displayName: 'Amex Gold',         rate: '4x dining' },
    next: { match: 'sapphire reserve',   displayName: 'Sapphire Reserve',  rate: '3x dining' },
  },
  'US groceries': {
    best: { match: 'gold card',          displayName: 'Amex Gold',         rate: '4x groceries' },
    next: { match: 'bilt',               displayName: 'Bilt',              rate: '1x' },
  },
  'Drugstores': {
    best: { match: 'freedom unlimited',  displayName: 'Freedom Unlimited', rate: '1.5%' },
    next: { match: 'bilt',               displayName: 'Bilt',              rate: '1x' },
  },
  'Hotels': {
    best: { match: 'venture x',          displayName: 'Venture X',         rate: '10x hotels' },
    next: { match: 'sapphire reserve',   displayName: 'Sapphire Reserve',  rate: '4x hotels' },
  },
  'Gas': {
    best: { match: 'freedom unlimited',  displayName: 'Freedom Unlimited', rate: '1.5%' },
    next: { match: 'bilt',               displayName: 'Bilt',              rate: '1x' },
  },
  'Entertainment': {
    best: { match: 'savor',              displayName: 'Savor',             rate: '4% entertainment' },
    next: { match: 'sapphire reserve',   displayName: 'Sapphire Reserve',  rate: '1x' },
  },
  'Rideshare': {
    best: { match: 'sapphire reserve',   displayName: 'Sapphire Reserve',  rate: '3x travel' },
    next: { match: 'venture x',          displayName: 'Venture X',         rate: '2x' },
  },
};

function findCardByMatch(allCards: Card[], match: string): Card | undefined {
  const m = match.toLowerCase();
  return allCards.find((c) => c.card_name.toLowerCase().includes(m));
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

interface MerchantThumbProps {
  card?: Card;
  fallbackLabel: string;
}

function MerchantThumb({ card, fallbackLabel }: MerchantThumbProps) {
  if (card?.card_image_link) {
    return (
      <span className="cj-rew-thumb">
        <CardImage cardImageLink={card.card_image_link} alt={card.card_name} fill sizes="32px" className="object-contain" />
      </span>
    );
  }
  return (
    <span
      className="cj-rew-thumb"
      style={{
        background: 'var(--paper-2)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontWeight: 600,
        color: 'var(--muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
      aria-label={fallbackLabel}
    >
      {fallbackLabel.slice(0, 2)}
    </span>
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

      {showList && merchants.length === 0 && (
        <div className="cj-verdict" style={{ marginTop: 16 }}>
          No merchants matched your wallet&apos;s reward categories within 1km. Try again from a different spot.
        </div>
      )}

      {showList && merchants.length > 0 && (
        <>
          <div className="cj-table-label" style={{ marginTop: 24 }}>
            {merchants.length} merchant{merchants.length === 1 ? '' : 's'} nearby · sorted by distance
          </div>
          <div className="cj-tape">
            <div
              className="cj-tape-head"
              style={{ gridTemplateColumns: '52px 1fr 96px 1.1fr 1fr 70px' }}
            >
              <div>Dist.</div>
              <div>Merchant</div>
              <div>Category</div>
              <div>Best</div>
              <div>Runner-up</div>
              <div className="cj-tape-res">Earn</div>
            </div>
            {merchants.map((m, i) => {
              const pick = PICKS[m.cat];
              if (!pick) return null;
              const isOpen = openIdx === i;
              const bestCard = findCardByMatch(allCards, pick.best.match);
              const nextCard = findCardByMatch(allCards, pick.next.match);
              const headlineEarn = pick.best.rate.split(' ')[0];

              return (
                <Fragment key={`${m.name}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                    className="cj-tape-row"
                    style={{
                      gridTemplateColumns: '52px 1fr 96px 1.1fr 1fr 70px',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                      background: isOpen ? 'var(--accent-2)' : 'var(--paper)',
                      border: 0,
                      borderTop: '1px solid var(--line)',
                      font: 'inherit',
                      fontFamily: 'inherit',
                      color: 'inherit',
                    }}
                    aria-expanded={isOpen}
                  >
                    <div className="cj-tape-when" style={{ fontVariantNumeric: 'tabular-nums' }}>{m.dist}</div>
                    <div className="cj-tape-event">
                      <span className="cj-tape-field">{m.name}</span>
                      <div className="cj-tape-detail">{m.addr}</div>
                    </div>
                    <div className="cj-tape-when" style={{ fontSize: 11 }}>{m.cat.toLowerCase()}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <MerchantThumb card={bestCard} fallbackLabel={pick.best.displayName} />
                      <div style={{ minWidth: 0 }}>
                        <div className="cj-cell-primary" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {pick.best.displayName}
                        </div>
                        <div className="cj-cell-detail">{pick.best.rate}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, opacity: 0.85 }}>
                      <MerchantThumb card={nextCard} fallbackLabel={pick.next.displayName} />
                      <div style={{ minWidth: 0 }}>
                        <div className="cj-cell-primary" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {pick.next.displayName}
                        </div>
                        <div className="cj-cell-detail">{pick.next.rate}</div>
                      </div>
                    </div>
                    <div className="cj-tape-res">
                      <span className="cj-eff-pct" style={{ fontSize: 14 }}>{headlineEarn}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div style={{
                      padding: '14px 18px 16px 78px',
                      borderTop: '1px solid var(--line)',
                      background: '#fbfaff',
                      fontSize: 12.5,
                      color: 'var(--ink-2)',
                      lineHeight: 1.6,
                    }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: '8px 28px',
                        marginBottom: 12,
                      }}>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Best</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <MerchantThumb card={bestCard} fallbackLabel={pick.best.displayName} />
                            <div>
                              <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{pick.best.displayName}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{pick.best.rate}</div>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Runner-up</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <MerchantThumb card={nextCard} fallbackLabel={pick.next.displayName} />
                            <div>
                              <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{pick.next.displayName}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{pick.next.rate}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="cj-wd-cta">add to apple wallet</button>
                        <a href="#" style={{
                          fontSize: 11.5, color: 'var(--ink-2)', textDecoration: 'none',
                          background: 'var(--paper)', border: '1px solid var(--line-2)',
                          borderRadius: 3, padding: '5px 9px', letterSpacing: '0.02em',
                        }}>see {pick.best.displayName} rules →</a>
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
