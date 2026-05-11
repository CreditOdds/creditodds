'use client';

// Plaid Link section for the Wallet — beta-gated. Renders the list of
// connected institutions + a "Connect a bank" CTA that opens Plaid Link.
//
// Visibility is decided in ProfileClient via getUserSettings(); this
// component assumes it's already been told it should render.

import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import {
  BuildingLibraryIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  getPlaidItems,
  deletePlaidItem,
  syncPlaidItem,
  getPlaidTransactions,
  type PlaidItem,
  type PlaidTransaction,
} from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';

const STATUS_LABELS: Record<PlaidItem['status'], string> = {
  healthy: 'Connected',
  login_required: 'Re-auth needed',
  pending_expiration: 'Expiring soon',
  revoked: 'Revoked',
  error: 'Error',
};

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

function formatAmount(amount: string | number, currency: string | null): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  const sign = n >= 0 ? '' : '−';
  return `${sign}$${Math.abs(n).toFixed(2)}${currency && currency !== 'USD' ? ` ${currency}` : ''}`;
}

export default function PlaidConnect() {
  const { getToken } = useAuth();
  const [items, setItems] = useState<PlaidItem[]>([]);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentTxns, setRecentTxns] = useState<PlaidTransaction[]>([]);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const [next, txns] = await Promise.all([
        getPlaidItems(token),
        getPlaidTransactions(token, { limit: 10 }).catch(() => ({ transactions: [], total: 0, limit: 10, offset: 0 })),
      ]);
      setItems(next);
      setRecentTxns(txns.transactions);
    } catch (e) {
      console.error('Failed to load Plaid items', e);
    }
  }, [getToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleStart = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const { link_token } = await createPlaidLinkToken(token);
      setLinkToken(link_token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start Plaid');
      setLoading(false);
    }
  }, [getToken]);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      try {
        const token = await getToken();
        if (!token) throw new Error('Not signed in');
        const institution = metadata.institution
          ? { id: metadata.institution.institution_id, name: metadata.institution.name }
          : null;
        await exchangePlaidPublicToken(publicToken, institution, token);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save connection');
      } finally {
        setLinkToken(null);
        setLoading(false);
      }
    },
    [getToken, refresh]
  );

  const onExit = useCallback(() => {
    setLinkToken(null);
    setLoading(false);
  }, []);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const handleDisconnect = async (itemRowId: number) => {
    if (!confirm('Disconnect this bank? We\'ll stop receiving transaction updates for it.')) return;
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      await deletePlaidItem(itemRowId, token);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect');
    }
  };

  const handleSync = async (itemRowId: number) => {
    setError(null);
    setSyncingId(itemRowId);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      await syncPlaidItem(itemRowId, token);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <section style={{ marginTop: 32 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <BuildingLibraryIcon style={{ width: 20, height: 20 }} />
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Connected banks</h2>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 999,
            background: '#eef2ff',
            color: '#4338ca',
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          Beta
        </span>
      </header>

      <p style={{ color: 'var(--muted, #6b7280)', fontSize: 13, marginBottom: 16, maxWidth: 640 }}>
        Connect a bank to track your real card spending and see when you're approaching
        category caps (groceries, dining, rotating quarters, etc). Your credentials never
        touch CreditOdds — Plaid handles authentication.
      </p>

      {items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px 0' }}>
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{item.institution_name || 'Unknown bank'}</div>
                <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>
                  {item.accounts.length} account{item.accounts.length === 1 ? '' : 's'}
                  {' · '}
                  <span style={{ color: item.status === 'healthy' ? '#059669' : '#b45309' }}>
                    {STATUS_LABELS[item.status]}
                  </span>
                  {' · '}
                  {item.transaction_count.toLocaleString()} txn{item.transaction_count === 1 ? '' : 's'}
                  {' · '}
                  synced {formatRelative(item.last_synced_at)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => handleSync(item.id)}
                  disabled={syncingId === item.id}
                  aria-label={`Sync ${item.institution_name || 'bank'} now`}
                  title="Sync now"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: syncingId === item.id ? 'not-allowed' : 'pointer',
                    color: '#4f46e5',
                    padding: 8,
                    opacity: syncingId === item.id ? 0.4 : 1,
                  }}
                >
                  <ArrowPathIcon
                    style={{
                      width: 18,
                      height: 18,
                      animation: syncingId === item.id ? 'spin 1s linear infinite' : undefined,
                    }}
                  />
                </button>
                <button
                  onClick={() => handleDisconnect(item.id)}
                  aria-label={`Disconnect ${item.institution_name || 'bank'}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#b91c1c',
                    padding: 8,
                  }}
                >
                  <TrashIcon style={{ width: 18, height: 18 }} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={loading}
        style={{
          padding: '10px 16px',
          background: '#4f46e5',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: loading ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          fontSize: 14,
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Opening Plaid…' : items.length > 0 ? '+ Connect another bank' : '+ Connect a bank'}
      </button>

      {recentTxns.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted, #6b7280)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Recent transactions
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13 }}>
            {recentTxns.map((t) => (
              <li
                key={t.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 4px',
                  borderBottom: '1px solid #f3f4f6',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.merchant_name || t.name || 'Unknown merchant'}
                    {t.pending ? <span style={{ marginLeft: 8, fontSize: 11, color: '#b45309' }}>pending</span> : null}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted, #6b7280)' }}>
                    {t.date}
                    {t.pfc_primary ? ` · ${t.pfc_primary}` : ''}
                    {t.mask ? ` · ··· ${t.mask}` : ''}
                  </div>
                </div>
                <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, marginLeft: 12 }}>
                  {formatAmount(t.amount, t.iso_currency_code)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#b91c1c',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <ExclamationTriangleIcon style={{ width: 16, height: 16, flexShrink: 0 }} />
          {error}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}
