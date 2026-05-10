'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import CardImage from '@/components/ui/CardImage';
import {
  BestCardHereReportPayload,
  Card,
  NearbyPlace,
  StoreBrandIndexEntry,
  WalletCard,
  getNearbyPlaces,
  getStoresBrandIndex,
} from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import {
  PlacePick,
  UnconfiguredCardPrompt,
  pickWalletCardsForPlace,
} from '@/lib/walletPicksForPlace';
import ReportMerchantModal from '@/components/wallet/ReportMerchantModal';
import SelectCategoriesModal from '@/components/wallet/SelectCategoriesModal';

// Resolved merchant ready for rendering. `label` is brand name when the
// place was matched to a Store entry (e.g. "marriott") so the user can
// see why the brand-gated 6x rate was applied; otherwise it's the reward
// category label (e.g. "hotels").
interface Merchant {
  id: string;
  name: string;
  label: string;
  dist: string;
  addr: string;
  picks: { best: PlacePick; next?: PlacePick };
  unconfiguredCards: UnconfiguredCardPrompt[];
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

function placesToMerchants(
  places: NearbyPlace[],
  walletCards: WalletCard[],
  allCards: Card[],
  brandIndex: StoreBrandIndexEntry[],
  userLat: number,
  userLng: number,
): Merchant[] {
  return places
    .map((p): Merchant | null => {
      const result = pickWalletCardsForPlace(walletCards, allCards, p, brandIndex);
      if (!result) return null;
      const dist = p.lat != null && p.lng != null
        ? metersToMiles(haversineMeters(userLat, userLng, p.lat, p.lng))
        : '—';
      return {
        id: p.id,
        name: p.name,
        label: result.label,
        dist,
        addr: p.address?.split(',')[0] ?? '',
        picks: result.next
          ? { best: result.best, next: result.next }
          : { best: result.best },
        unconfiguredCards: result.unconfiguredCards,
      };
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

// sessionStorage key for the last successful nearby lookup. Survives
// tab switches within Profile (BestCardHere unmounts when activeTab
// leaves "rewards") and full reloads, but clears when the browser
// session ends — matching "while they're in that session." Bump the
// version when the shape changes so stale entries are dropped.
const SESSION_CACHE_KEY = 'cj-bch-cache-v1';

interface SessionCache {
  location: Location;
  placesCache: {
    places: NearbyPlace[];
    brandIndex: StoreBrandIndexEntry[];
    lat: number;
    lng: number;
  };
}

function readSessionCache(): SessionCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionCache;
  } catch {
    return null;
  }
}

function writeSessionCache(value: SessionCache): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(value));
  } catch {
    // sessionStorage can throw in Safari private mode or when full;
    // a missed cache write is non-fatal — user just re-prompts on next visit.
  }
}

function clearSessionCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // see writeSessionCache
  }
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
  onEnable: () => void;
  onClear: () => void;
}

function LocationBlock({ location, onEnable, onClear }: LocationBlockProps) {
  if (!location) {
    return (
      <div className="cj-bch-cta-wrap">
        <button type="button" className="cj-bch-cta-btn" onClick={onEnable}>
          Find Best Near Me
        </button>
      </div>
    );
  }
  return (
    <div className="cj-bch-loc">
      <span className="cj-bch-loc-dot" />
      <div className="cj-bch-loc-text">
        <span className="cj-bch-loc-label">{location.label}</span>
        <span className="cj-bch-loc-coords">{location.coords} · ±{location.accuracy}m</span>
      </div>
      <button type="button" className="cj-bch-loc-update" onClick={onClear}>
        update
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

function PickDetail({ label, pick }: { label: string; pick: PlacePick }) {
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
  /**
   * Called after the user saves category picks for a held card so the
   * parent (ProfileClient) can re-fetch /wallet and pass fresh
   * `walletCards` back in. Without this the BCH list keeps stale
   * "unconfigured" prompts even after saving.
   */
  onWalletRefresh?: () => Promise<void> | void;
}

export default function BestCardHere({ walletCards, allCards, onWalletRefresh }: BestCardHereProps) {
  const { getToken } = useAuth();
  // Hydrate from sessionStorage on first render so the user's last
  // lookup survives tab switches inside Profile and full reloads
  // within the same browser session.
  const initialCache = typeof window !== 'undefined' ? readSessionCache() : null;
  const [location, setLocation] = useState<Location | null>(initialCache?.location ?? null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [reportPayload, setReportPayload] =
    useState<Omit<BestCardHereReportPayload, 'reason' | 'notes'> | null>(null);
  const [selectionsTarget, setSelectionsTarget] =
    useState<{ walletCard: WalletCard; card: Card } | null>(null);

  // Cache of the last successful fetch — places + coords + brandIndex —
  // so we can recompute merchants in-place when the user updates picks
  // without re-prompting for location or hitting Places again.
  const [placesCache, setPlacesCache] = useState<{
    places: NearbyPlace[];
    brandIndex: StoreBrandIndexEntry[];
    lat: number;
    lng: number;
  } | null>(initialCache?.placesCache ?? null);

  const cardsCount = walletCards.length;

  // Recompute merchants whenever wallet changes, using the cached places.
  // Triggers after the user saves selections (parent re-fetches wallet,
  // walletCards prop updates, this effect fires).
  useEffect(() => {
    if (!placesCache) return;
    const resolved = placesToMerchants(
      placesCache.places,
      walletCards,
      allCards,
      placesCache.brandIndex,
      placesCache.lat,
      placesCache.lng,
    );
    setMerchants(resolved);
  }, [walletCards, allCards, placesCache]);

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
      // Fetch places + brand index in parallel; the brand index is a
      // small static blob and tolerates failure (we just lose brand-aware
      // matching for this lookup, falling back to category-only).
      const [placesResult, brandIndex] = await Promise.all([
        getNearbyPlaces(coords.latitude, coords.longitude, token),
        getStoresBrandIndex().catch((e) => {
          console.error('Brand index fetch failed; falling back to category-only matching', e);
          return [] as StoreBrandIndexEntry[];
        }),
      ]);
      const resolved = placesToMerchants(
        placesResult.places,
        walletCards,
        allCards,
        brandIndex,
        coords.latitude,
        coords.longitude,
      );
      setMerchants(resolved);
      const nextPlacesCache = {
        places: placesResult.places,
        brandIndex,
        lat: coords.latitude,
        lng: coords.longitude,
      };
      const nextLocation: Location = {
        label: 'Your location',
        coords: `${coords.latitude.toFixed(4)}° ${coords.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(coords.longitude).toFixed(4)}° ${coords.longitude >= 0 ? 'E' : 'W'}`,
        accuracy: Math.round(coords.accuracy),
      };
      setPlacesCache(nextPlacesCache);
      setLocation(nextLocation);
      writeSessionCache({ location: nextLocation, placesCache: nextPlacesCache });
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
    setPlacesCache(null);
    clearSessionCache();
  };

  // Aggregate every "needs picks" card across the visible merchant rows so
  // we can show one banner at the top (instead of repeating the prompt
  // per merchant). Dedup by wallet row id; keep the highest potential rate.
  const unconfiguredAggregate = useMemo(() => {
    const byRowId = new Map<number, UnconfiguredCardPrompt>();
    for (const m of merchants) {
      for (const u of m.unconfiguredCards) {
        const existing = byRowId.get(u.walletRowId);
        if (!existing || u.potentialRate > existing.potentialRate) {
          byRowId.set(u.walletRowId, u);
        }
      }
    }
    return Array.from(byRowId.values());
  }, [merchants]);

  const openSelectionsFor = (walletRowId: number) => {
    const wc = walletCards.find((w) => w.id === walletRowId);
    if (!wc) return;
    const card = allCards.find((c) => c.card_name === wc.card_name);
    if (!card) return;
    setSelectionsTarget({ walletCard: wc, card });
  };

  const handleSelectionsSaved = async () => {
    if (onWalletRefresh) await onWalletRefresh();
  };

  const showList = location && !loading;

  // Picks are resolved at fetch time (placesToMerchants) so they capture
  // the brand index from that moment. Memoize the rendered list to keep
  // referential stability for the row keys.
  const merchantRows = useMemo(() => merchants, [merchants]);

  const buildReportPayload = (
    merchant: Merchant,
    pick: PlacePick,
  ): Omit<BestCardHereReportPayload, 'reason' | 'notes'> => ({
    merchant_place_id: merchant.id,
    merchant_name: merchant.name,
    merchant_address: merchant.addr || undefined,
    merchant_category: merchant.label,
    merchant_distance: merchant.dist,
    recommended_card_id:
      typeof pick.card.db_card_id === 'number' ? pick.card.db_card_id : undefined,
    recommended_card_name: pick.card.card_name,
    rate_label: pick.rateLabel,
    rate_context: pick.context,
    wallet_size: cardsCount,
  });

  return (
    <div className="cj-bch-shell" style={{ paddingBottom: 8 }}>
      <div className="cj-bch-icon-col" aria-hidden="true">
        <span className="cj-bch-pin">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s7-7 7-13a7 7 0 0 0-14 0c0 6 7 13 7 13z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
        </span>
        <BetaPill />
      </div>
      <div className="cj-bch-head" style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 className="cj-section-h2" style={{ margin: 0, fontSize: 26 }}>
          Best card <em className="cj-section-accent">here.</em>
        </h2>
        <span className="cj-section-num" style={{ marginLeft: 'auto' }}>
          pilot
        </span>
      </div>
      <p style={{
        margin: '8px 0 0',
        fontSize: 13,
        color: 'var(--ink-2)',
        lineHeight: 1.6,
        maxWidth: '64ch',
      }}>
        Share your location to see nearby businesses with the best card from your wallet
        to swipe at each. We don&apos;t store coordinates.
      </p>

      <LocationBlock
        location={location}
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

      {showList && cardsCount > 0 && merchantRows.length === 0 && (
        <div className="cj-verdict" style={{ marginTop: 16 }}>
          No nearby merchants matched a reward category for the cards in your wallet. Try a different spot, or add a card with broader earn categories.
        </div>
      )}

      {showList && unconfiguredAggregate.length > 0 && (
        <div
          className="cj-verdict"
          style={{
            marginTop: 16,
            background: '#f7f3ff',
            borderLeftColor: 'var(--accent)',
          }}
        >
          <b>Pick categories to unlock matches.</b>{' '}
          {unconfiguredAggregate.length === 1
            ? 'One card in your wallet has bonus categories you choose.'
            : `${unconfiguredAggregate.length} cards in your wallet have bonus categories you choose.`}
          {' '}Tell us which ones so they can rank here.
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {unconfiguredAggregate.map((u) => (
              <button
                key={u.walletRowId}
                type="button"
                onClick={() => openSelectionsFor(u.walletRowId)}
                className="cj-bch-cta-btn"
                style={{ padding: '5px 10px', fontSize: 11 }}
              >
                pick categories on {u.cardName} →
              </button>
            ))}
          </div>
        </div>
      )}

      {showList && merchantRows.length > 0 && (
        <>
          <div className="cj-table-label" style={{ marginTop: 24 }}>
            {merchantRows.length} merchant{merchantRows.length === 1 ? '' : 's'} nearby · sorted by distance
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
            {merchantRows.map((m, i) => {
              const isOpen = openIdx === i;
              const best = m.picks.best;
              const next = m.picks.next;

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
                        <span className="cj-bch-mob-meta"> · {m.label} · {m.dist}</span>
                      </div>
                    </div>
                    <div className="cj-tape-when cj-bch-cat" style={{ fontSize: 11 }}>{m.label}</div>
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
                        {best.card.slug && (
                          <a href={`/card/${best.card.slug}`} style={{
                            fontSize: 11.5, color: 'var(--ink-2)', textDecoration: 'none',
                            background: 'var(--paper)', border: '1px solid var(--line-2)',
                            borderRadius: 3, padding: '5px 9px', letterSpacing: '0.02em',
                          }}>see {best.card.card_name} rules →</a>
                        )}
                        <button
                          type="button"
                          className="cj-bch-report-trigger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReportPayload(buildReportPayload(m, best));
                          }}
                        >
                          report this match
                        </button>
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
            (Freedom Flex, Discover) are not yet considered. Tap <em>report this match</em> on any merchant
            if a category, card, or earn rate looks off.
          </div>
        </>
      )}

      <ReportMerchantModal
        show={reportPayload !== null}
        onClose={() => setReportPayload(null)}
        payload={reportPayload ?? { merchant_name: '' }}
      />

      <SelectCategoriesModal
        show={selectionsTarget !== null}
        walletCard={selectionsTarget?.walletCard ?? null}
        card={selectionsTarget?.card ?? null}
        onClose={() => setSelectionsTarget(null)}
        onSuccess={handleSelectionsSaved}
      />
    </div>
  );
}
