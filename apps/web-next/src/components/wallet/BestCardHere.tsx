'use client';

import { Fragment, useState } from 'react';
import CardImage from '@/components/ui/CardImage';
import { Card, WalletCard } from '@/lib/api';

// Mock merchants near "Mission District, SF" — UI-only seam. A real
// fetchNearbyMerchants(lat, lng) (Google or Foursquare) drops in here later.
interface MockMerchant {
  name: string;
  cat: string;
  dist: string;
  addr: string;
}

const MERCHANTS: MockMerchant[] = [
  { name: 'Tartine Manufactory', cat: 'Dining', dist: '0.2 mi', addr: '595 Alabama St' },
  { name: 'Bi-Rite Market', cat: 'US groceries', dist: '0.3 mi', addr: '3639 18th St' },
  { name: 'Foreign Cinema', cat: 'Dining', dist: '0.4 mi', addr: '2534 Mission St' },
  { name: 'Walgreens', cat: 'Drugstores', dist: '0.4 mi', addr: '1979 Mission St' },
  { name: 'Hotel Via', cat: 'Hotels', dist: '0.6 mi', addr: '138 King St' },
  { name: 'Shell', cat: 'Gas', dist: '0.6 mi', addr: '300 S Van Ness' },
  { name: 'Whole Foods Market', cat: 'US groceries', dist: '0.7 mi', addr: '2001 Market St' },
  { name: 'Philz Coffee', cat: 'Dining', dist: '0.7 mi', addr: '3101 24th St' },
  { name: 'Alamo Drafthouse', cat: 'Entertainment', dist: '0.8 mi', addr: '2550 Mission St' },
  { name: "Trader Joe's", cat: 'US groceries', dist: '0.9 mi', addr: '555 9th St' },
  { name: 'Uber', cat: 'Rideshare', dist: '—', addr: 'right where you are' },
  { name: 'Hayes Street Grill', cat: 'Dining', dist: '1.1 mi', addr: '320 Hayes St' },
];

// Stub for the future real implementation. Returns the same mock list so
// the component can be swapped to a real fetch without re-shaping props.
async function fetchNearbyMerchants(_lat: number, _lng: number): Promise<MockMerchant[]> {
  return MERCHANTS;
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
  const [location, setLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(false);
  const [merchants, setMerchants] = useState<MockMerchant[]>([]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const cardsCount = walletCards.length;

  const enable = async () => {
    setLoading(true);
    setOpenIdx(null);
    // Mock: 700ms delay so users can see the locating state. Real geolocation
    // + Places fetch would replace this block; the rest of the component is
    // already shaped around the same data contract.
    await new Promise((resolve) => setTimeout(resolve, 700));
    const mockLat = 37.7599;
    const mockLng = -122.4148;
    const data = await fetchNearbyMerchants(mockLat, mockLng);
    setMerchants(data);
    setLocation({
      label: 'Mission District, San Francisco',
      coords: '37.7599° N, 122.4148° W',
      accuracy: 18,
    });
    setLoading(false);
  };

  const clear = () => {
    setLocation(null);
    setMerchants([]);
    setOpenIdx(null);
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
          locating · scanning {MERCHANTS.length} nearby merchants…
        </div>
      )}

      {showList && (
        <>
          <div className="cj-table-label" style={{ marginTop: 24 }}>
            {merchants.length} merchants within 1.1 mi · sorted by distance
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
