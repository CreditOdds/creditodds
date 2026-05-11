'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import CardImage from '@/components/ui/CardImage';
import {
  BestCardHereReportPayload,
  Card,
  WalletCard,
  WalletPickPlace,
  WalletPickPlaceMatch,
  WalletPickUnconfiguredCard,
  PlaidSpendSummary,
  getNearbyWalletPicks,
} from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { isCapped } from '@/lib/walletCaps';
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
  categoryId: string;  // CreditOdds reward-category id used to drive cap-aware demotion
  dist: string;
  addr: string;
  picks: { best: WalletPickPlace; next?: WalletPickPlace };
  unconfiguredCards: WalletPickUnconfiguredCard[];
}

// Round effective % to 1 decimal, drop trailing .0 (4.0 → "4", 4.5 → "4.5").
function formatEffectivePct(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r}%`;
}

// Cell-detail line under the card name. Reason strings already include the
// rate prefix (e.g. "5% on dining"), so we only re-prepend rateLabel when
// the reason doesn't start with it (e.g. co-brand reasons). For points
// cards we append the cash-equivalent so users can compare against
// straight-cash cards in the same merchant row.
function pickDetailLine(pick: WalletPickPlace): string {
  const base = pick.context.startsWith(pick.rateLabel)
    ? pick.context
    : `${pick.rateLabel} ${pick.context}`;
  if (pick.unit === 'percent') return base;
  return `${base} (≈${formatEffectivePct(pick.effectiveRate)} back)`;
}

// Big right-column rate. For points cards we show the effective % instead
// of "5x points" so a 5x-points pick and a 4% cash pick are directly
// comparable across merchant rows.
function pickHeadlineRate(pick: WalletPickPlace): string {
  if (pick.unit === 'percent') return pick.rateLabel;
  return `≈${formatEffectivePct(pick.effectiveRate)}`;
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

// Convert the backend's pre-resolved merchant payload into the row shape
// we render. The backend already filtered out merchants with no match;
// we just compute distance from the user's coords and sort.
function backendMerchantsToRows(
  serverMerchants: Array<{
    place: { id: string; name: string; address: string | null; lat: number | null; lng: number | null };
    match: WalletPickPlaceMatch;
  }>,
  userLat: number,
  userLng: number,
): Merchant[] {
  return serverMerchants
    .map((m): Merchant => {
      const dist = m.place.lat != null && m.place.lng != null
        ? metersToMiles(haversineMeters(userLat, userLng, m.place.lat, m.place.lng))
        : '—';
      return {
        id: m.place.id,
        name: m.place.name,
        label: m.match.label,
        categoryId: m.match.categoryId,
        dist,
        addr: m.place.address?.split(',')[0] ?? '',
        picks: m.match.next
          ? { best: m.match.best, next: m.match.next }
          : { best: m.match.best },
        unconfiguredCards: m.match.unconfiguredCards,
      };
    })
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
//
// v2 cache shape: drops the embedded places + brandIndex (computation
// lives on the backend now). We just remember the coords so a wallet
// update can re-fetch /wallet-picks/nearby without re-prompting the
// browser for location.
const SESSION_CACHE_KEY = 'cj-bch-cache-v2';

interface SessionCache {
  location: Location;
  lat: number;
  lng: number;
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

function PickDetail({ label, pick }: { label: string; pick: WalletPickPlace }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <PickThumb card={pick.card} />
        <div>
          <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{pick.card.card_name}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{pickDetailLine(pick)}</div>
        </div>
      </div>
    </div>
  );
}

interface BestCardHereProps {
  walletCards: WalletCard[];
  allCards: Card[];
  /**
   * Plaid-derived spend rollups, one per mapped wallet card. Used to demote
   * a recommended card when it has hit its category cap this cycle.
   * Empty array (or nullish) → cap-aware demotion is skipped entirely.
   */
  plaidSummaries?: PlaidSpendSummary[];
  /**
   * Called after the user saves category picks for a held card so the
   * parent (ProfileClient) can re-fetch /wallet and pass fresh
   * `walletCards` back in. Without this the BCH list keeps stale
   * "unconfigured" prompts even after saving.
   */
  onWalletRefresh?: () => Promise<void> | void;
}

export default function BestCardHere({ walletCards, allCards, plaidSummaries = [], onWalletRefresh }: BestCardHereProps) {
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

  // Cache of the lat/lng we last fetched against. Lets us re-issue
  // /wallet-picks/nearby after the user saves new selections without
  // re-prompting for location.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initialCache ? { lat: initialCache.lat, lng: initialCache.lng } : null,
  );

  const cardsCount = walletCards.length;

  const fetchFromBackend = useCallback(
    async (lat: number, lng: number): Promise<Merchant[]> => {
      const token = await getToken();
      if (!token) throw new Error('You need to be signed in to use this feature.');
      const result = await getNearbyWalletPicks(lat, lng, token);
      return backendMerchantsToRows(result.merchants, lat, lng);
    },
    [getToken],
  );

  // Re-fetch from backend when wallet changes (e.g. after the user saves
  // selections via the modal). The Places lookup is cached server-side
  // for ~10 min per grid cell so this is fast.
  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchFromBackend(coords.lat, coords.lng);
        if (!cancelled) setMerchants(rows);
      } catch (e) {
        if (!cancelled) {
          console.error('BestCardHere refresh failed', e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletCards, coords, fetchFromBackend]);

  const enable = async () => {
    setErrorMessage(null);
    setOpenIdx(null);

    if (!('geolocation' in navigator)) {
      setErrorMessage('Your browser does not support location lookup.');
      return;
    }

    setLoading(true);

    let position: GeolocationCoordinates;
    try {
      position = await new Promise<GeolocationCoordinates>((resolve, reject) => {
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
      const rows = await fetchFromBackend(position.latitude, position.longitude);
      setMerchants(rows);
      const nextCoords = { lat: position.latitude, lng: position.longitude };
      const nextLocation: Location = {
        label: 'Your location',
        coords: `${position.latitude.toFixed(4)}° ${position.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(position.longitude).toFixed(4)}° ${position.longitude >= 0 ? 'E' : 'W'}`,
        accuracy: Math.round(position.accuracy),
      };
      setCoords(nextCoords);
      setLocation(nextLocation);
      writeSessionCache({ location: nextLocation, lat: nextCoords.lat, lng: nextCoords.lng });
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
    setCoords(null);
    clearSessionCache();
  };

  // Aggregate every "needs picks" card across the visible merchant rows so
  // we can show one banner at the top (instead of repeating the prompt
  // per merchant). Dedup by wallet row id; keep the highest potential rate.
  const unconfiguredAggregate = useMemo(() => {
    const byRowId = new Map<number, WalletPickUnconfiguredCard>();
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
    pick: WalletPickPlace,
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
              const originalBest = m.picks.best;
              const originalNext = m.picks.next;

              // Cap-aware swap: if every wallet row of the recommended card has
              // hit its cap on this merchant's category, demote it and surface
              // the runner-up. Conservative — only demote when we have data;
              // unmapped or uncapped cards stay where they are.
              const matchingWalletRows = walletCards.filter((w) => {
                const cat = allCards.find((ac) => ac.card_name === w.card_name);
                return cat?.card_id === originalBest.card.card_id;
              });
              const allMatchingMappedAndCapped =
                plaidSummaries.length > 0 &&
                matchingWalletRows.length > 0 &&
                matchingWalletRows.every((w) => {
                  const mapped = plaidSummaries.some((s) => s.user_card_id === w.id);
                  if (!mapped) return false; // can't tell — assume not capped
                  return isCapped(w.id, w, originalBest.card, m.categoryId, plaidSummaries);
                });
              const swapDueToCap = allMatchingMappedAndCapped && Boolean(originalNext);
              const best = swapDueToCap && originalNext ? originalNext : originalBest;
              const next = swapDueToCap ? originalBest : originalNext;

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
                        <div className="cj-cell-primary">
                          {best.card.card_name}
                          {swapDueToCap && (
                            <span
                              title={`${originalBest.card.card_name} hit its ${m.label} cap this cycle — runner-up promoted`}
                              style={{
                                marginLeft: 6,
                                fontSize: 9.5,
                                fontWeight: 700,
                                letterSpacing: 0.4,
                                padding: '1px 5px',
                                borderRadius: 3,
                                background: '#fef3c7',
                                color: '#92400e',
                                textTransform: 'uppercase',
                                verticalAlign: 'middle',
                              }}
                            >
                              swapped
                            </span>
                          )}
                        </div>
                        <div className="cj-cell-detail">{pickDetailLine(best)}</div>
                      </div>
                    </div>
                    <div className="cj-bch-card cj-bch-next">
                      {next ? (
                        <>
                          <PickThumb card={next.card} />
                          <div className="cj-bch-card-text">
                            <div className="cj-cell-primary">{next.card.card_name}</div>
                            <div className="cj-cell-detail">{pickDetailLine(next)}</div>
                          </div>
                        </>
                      ) : (
                        <div className="cj-cell-detail" style={{ opacity: 0.7 }}>—</div>
                      )}
                    </div>
                    <div className="cj-tape-res cj-bch-earn">
                      <span className="cj-eff-pct cj-bch-earn-val">{pickHeadlineRate(best)}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="cj-bch-detail">
                      {swapDueToCap && (
                        <div
                          style={{
                            marginBottom: 10,
                            padding: '8px 10px',
                            background: '#fef3c7',
                            border: '1px solid #fde68a',
                            borderRadius: 4,
                            fontSize: 12,
                            color: '#78350f',
                          }}
                        >
                          <b>{originalBest.card.card_name}</b> hit its {m.label} cap this cycle — runner-up promoted to best.
                        </div>
                      )}
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
