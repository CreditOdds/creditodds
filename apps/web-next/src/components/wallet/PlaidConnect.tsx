'use client';

// Plaid Link section for the Wallet — beta-gated. Renders the list of
// connected institutions + a "Connect a bank" CTA that opens Plaid Link.
//
// Visibility is decided in ProfileClient via getUserSettings(); this
// component assumes it's already been told it should render.

import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { BuildingLibraryIcon, TrashIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  getPlaidItems,
  deletePlaidItem,
  type PlaidItem,
} from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';

const STATUS_LABELS: Record<PlaidItem['status'], string> = {
  healthy: 'Connected',
  login_required: 'Re-auth needed',
  pending_expiration: 'Expiring soon',
  revoked: 'Revoked',
  error: 'Error',
};

export default function PlaidConnect() {
  const { getToken } = useAuth();
  const [items, setItems] = useState<PlaidItem[]>([]);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const next = await getPlaidItems(token);
      setItems(next);
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

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

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
                </div>
              </div>
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
    </section>
  );
}
