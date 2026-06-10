'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CardImage from '@/components/ui/CardImage';
import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/auth/AuthProvider';
import { V2Footer } from '@/components/landing-v2/Chrome';
import { getWalletEvents, WalletCardEvent } from '@/lib/api';
import '../../landing.css';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function reasonLabel(reason: WalletCardEvent['reason']): string | null {
  if (reason === 'voluntary') return 'You requested it';
  if (reason === 'forced') return 'Bank initiated';
  return null;
}

export default function WalletHistoryClient() {
  const { authState, getToken } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<WalletCardEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authState.isLoading) return;
    if (!authState.isAuthenticated) {
      router.replace('/login?next=/profile/history');
      return;
    }
    (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error('Authentication required');
        const rows = await getWalletEvents(token);
        setEvents(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load wallet history');
      } finally {
        setLoaded(true);
      }
    })();
  }, [authState.isAuthenticated, authState.isLoading, getToken, router]);

  return (
    <div className="landing-v2 profile-v2">
      <main className="cj-main" style={{ paddingTop: 24, paddingBottom: 48 }}>
        <div className="wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Link href="/profile" className="cj-modal-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ArrowLeftIcon style={{ width: 12, height: 12 }} /> back to profile
            </Link>
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 600, margin: '0 0 4px' }}>Wallet history</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 24px' }}>
            Every product change recorded on your wallet cards, newest first.
          </p>

          {error && <div className="cj-modal-error" style={{ marginBottom: 16 }}>{error}</div>}

          {!loaded && (
            <div style={{ padding: '32px 0', color: 'var(--muted)', fontSize: 14 }}>Loading…</div>
          )}

          {loaded && events.length === 0 && !error && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 24, color: 'var(--muted)', fontSize: 14 }}>
              No product changes recorded yet. When you convert a wallet card to another product from the same issuer, the change shows up here.
            </div>
          )}

          {loaded && events.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {events.map((e) => {
                const reason = reasonLabel(e.reason);
                return (
                  <li
                    key={e.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 16,
                      background: 'var(--surface)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span className="cj-modal-thumb" style={{ flexShrink: 0 }}>
                          <CardImage
                            cardImageLink={e.old_card_image_link || undefined}
                            alt={e.old_card_name || 'Old card'}
                            fill
                            className="object-contain"
                            sizes="56px"
                          />
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--text)', minWidth: 0 }}>
                          {e.old_card_name || `Card #${e.old_card_id}`}
                        </span>
                      </div>

                      <ArrowRightIcon style={{ width: 14, height: 14, color: 'var(--muted)', flexShrink: 0 }} />

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span className="cj-modal-thumb" style={{ flexShrink: 0 }}>
                          <CardImage
                            cardImageLink={e.new_card_image_link || undefined}
                            alt={e.new_card_name || 'New card'}
                            fill
                            className="object-contain"
                            sizes="56px"
                          />
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 0 }}>
                          {e.new_card_name || `Card #${e.new_card_id}`}
                        </span>
                      </div>

                      <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
                        <div>{formatDate(e.change_date)}</div>
                        {e.bank && <div style={{ fontSize: 11 }}>{e.bank}</div>}
                      </div>
                    </div>

                    {(reason || e.note) && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
                        {reason && <div>{reason}</div>}
                        {e.note && <div style={{ marginTop: 4, fontStyle: 'italic' }}>“{e.note}”</div>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
      <V2Footer />
    </div>
  );
}
