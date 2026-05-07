'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { Card, NearbyPlace, WalletCard, getNearbyPlaces } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { categoryLabels, formatRewardWithUsdEquivalent } from '@/lib/cardDisplayUtils';
import { mapPlaceToCategory } from '@/lib/placeTypeMapping';
import { pickBestCardForCategory } from '@/lib/pickBestCardForCategory';

interface NearbyBestCardProps {
  walletCards: WalletCard[];
  allCards: Card[];
}

interface Row {
  place: NearbyPlace;
  category: string;
  categoryLabel: string;
  pick: ReturnType<typeof pickBestCardForCategory>;
}

type Status = 'idle' | 'locating' | 'fetching' | 'ready' | 'error';

export default function NearbyBestCard({ walletCards, allCards }: NearbyBestCardProps) {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [cached, setCached] = useState(false);

  const rows = useMemo<Row[]>(() => {
    return places.map((place) => {
      const match = mapPlaceToCategory({
        name: place.name,
        primaryType: place.primaryType ?? undefined,
        types: place.types,
      });
      const pick = pickBestCardForCategory(walletCards, allCards, match.category);
      return {
        place,
        category: match.category,
        categoryLabel: categoryLabels[match.category] || match.category,
        pick,
      };
    });
  }, [places, walletCards, allCards]);

  const handleFind = useCallback(async () => {
    setErrorMessage(null);
    if (!('geolocation' in navigator)) {
      setStatus('error');
      setErrorMessage('Your browser does not support location lookup.');
      return;
    }

    setStatus('locating');
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
      setStatus('error');
      const msg = e instanceof GeolocationPositionError && e.code === 1
        ? 'Location permission denied. Allow location access to see nearby places.'
        : 'Could not determine your location. Try again in a moment.';
      setErrorMessage(msg);
      return;
    }

    setStatus('fetching');
    try {
      const token = await getToken();
      if (!token) {
        setStatus('error');
        setErrorMessage('You need to be signed in to use this feature.');
        return;
      }
      const result = await getNearbyPlaces(coords.latitude, coords.longitude, token);
      setPlaces(result.places);
      setCached(result.cached);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      setErrorMessage(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }, [getToken]);

  if (walletCards.length === 0) {
    return (
      <div className="cj-verdict">
        <b>Add cards to your wallet first.</b> The Nearby beta picks the best of <em>your</em> cards
        for each spot — it needs to know what you carry.
      </div>
    );
  }

  return (
    <section className="cj-section">
      <div className="cj-table-label">
        <span style={{ display: 'inline-block', padding: '2px 6px', background: 'var(--accent-2)', color: 'var(--accent)', borderRadius: 2, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 8, verticalAlign: '1px' }}>
          Beta
        </span>
        Find the best card to use at nearby places. We share your location with our server to look up
        businesses within 1km — never stored or logged.
      </div>

      {status === 'idle' && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="cj-inline-cta" onClick={handleFind}>
            find nearby places
          </button>
        </div>
      )}

      {(status === 'locating' || status === 'fetching') && (
        <div className="cj-verdict" style={{ marginTop: 12 }}>
          {status === 'locating' ? 'Getting your location…' : 'Looking up nearby places…'}
        </div>
      )}

      {status === 'error' && errorMessage && (
        <div className="cj-verdict" style={{ marginTop: 12, background: '#fef9e8', borderLeftColor: '#a8792a', color: '#5c4318' }}>
          <b style={{ color: '#a8792a' }}>{errorMessage}</b>
          <div style={{ marginTop: 8 }}>
            <button type="button" className="cj-inline-cta" onClick={handleFind}>
              try again
            </button>
          </div>
        </div>
      )}

      {status === 'ready' && rows.length === 0 && (
        <div className="cj-verdict" style={{ marginTop: 12 }}>
          No relevant businesses found within 1km. Try again from a different spot.
        </div>
      )}

      {status === 'ready' && rows.length > 0 && (
        <>
          <div style={{ marginTop: 12, marginBottom: 8, fontSize: 11, color: 'var(--muted-2)' }}>
            {rows.length} place{rows.length === 1 ? '' : 's'} nearby{cached ? ' · cached' : ''} ·{' '}
            <button
              type="button"
              onClick={handleFind}
              style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
            >
              refresh
            </button>
          </div>
          <table className="cj-table">
            <thead>
              <tr>
                <th>Place</th>
                <th>Best card</th>
                <th className="cj-tr">Earn</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.place.id}>
                  <td>
                    <div className="cj-cell-primary">{row.place.name}</div>
                    <div className="cj-cell-detail">
                      {row.categoryLabel}
                      {row.place.address ? ` · ${row.place.address.split(',')[0]}` : ''}
                    </div>
                  </td>
                  <td>
                    {row.pick ? <PickCell pick={row.pick.primary} /> : <span className="cj-cell-detail">—</span>}
                  </td>
                  <td className="cj-tr">
                    {row.pick ? (
                      <span className="cj-eff-pct">
                        {formatRewardWithUsdEquivalent(row.pick.primary.reward, row.pick.primary.card)}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cj-verdict" style={{ marginTop: 16, fontSize: 12 }}>
            Recommendations are based on the place&apos;s category from Google Maps. Actual reward
            categories depend on the merchant&apos;s billing code, so the issuer&apos;s coding may differ.
          </div>
        </>
      )}
    </section>
  );
}

function PickCell({ pick }: { pick: NonNullable<ReturnType<typeof pickBestCardForCategory>>['primary'] }) {
  const { card, reward, slotNote } = pick;
  const note = slotNote ?? reward.note;
  const href = card.slug ? `/card/${card.slug}` : undefined;
  const inner = (
    <div className="cj-rew-best">
      <span className="cj-rew-thumb">
        <CardImage cardImageLink={card.card_image_link} alt={card.card_name} fill className="object-contain" sizes="32px" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="cj-cell-primary">{card.card_name}</div>
        {note && <div className="cj-cell-detail">{note}</div>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      {inner}
    </Link>
  ) : inner;
}
