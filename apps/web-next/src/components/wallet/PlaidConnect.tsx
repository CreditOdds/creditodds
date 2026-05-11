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
  getPlaidSpendSummary,
  setPlaidAccountCard,
  type PlaidItem,
  type PlaidAccount,
  type PlaidTransaction,
  type PlaidSpendSummary,
  type WalletCard,
  type Card,
} from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { pfcToCategory, categoryLabel } from '@/lib/plaidPfc';

interface PlaidConnectProps {
  walletCards: WalletCard[];
  allCards: Card[];
}

// Roll up per-account spend buckets by CreditOdds reward category. Uses the
// PFC-detailed → primary fallback inside pfcToCategory so we attribute as
// specifically as possible (e.g. FOOD_AND_DRINK_GROCERIES → groceries, not the
// fall-through dining default).
function bucketsByCategory(summary: PlaidSpendSummary): Map<string, { spend: number; txnCount: number }> {
  const out = new Map<string, { spend: number; txnCount: number }>();
  for (const b of summary.buckets) {
    const cat = pfcToCategory(b.pfc_primary, b.pfc_detailed);
    const existing = out.get(cat) || { spend: 0, txnCount: 0 };
    existing.spend += Number(b.spend) || 0;
    existing.txnCount += b.txn_count;
    out.set(cat, existing);
  }
  return out;
}

interface CapInfo {
  category: string;
  rate: number;
  unit: string;
  cap?: number;
  capPeriod?: string;
}

// Pull the rate + cap for a given CreditOdds category from a card's rewards
// array. Returns null if the card has no matching reward (in which case the
// transaction earns the card's flat rate, which we don't surface here).
function rewardForCategory(card: Card | undefined, category: string): CapInfo | null {
  if (!card?.rewards) return null;
  const reward = card.rewards.find((r) => r.category === category);
  if (!reward) return null;
  return {
    category,
    rate: reward.value,
    unit: reward.unit,
    cap: reward.spend_cap,
    capPeriod: reward.cap_period,
  };
}

// Wallet allows duplicates of the same card (each is its own row by id), so the
// picker needs to distinguish them. Strategy: only annotate when there's >1 of
// a given card_name, and show acquired date if set, else (A)/(B)/(C) by sort.
function buildPickerLabels(cards: WalletCard[]): Map<number, string> {
  const labels = new Map<number, string>();
  const groups = new Map<string, WalletCard[]>();
  for (const c of cards) {
    const list = groups.get(c.card_name) || [];
    list.push(c);
    groups.set(c.card_name, list);
  }
  const monthNames = [
    'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec',
  ];
  for (const [name, list] of groups) {
    if (list.length === 1) {
      labels.set(list[0].id, `${name} (${list[0].bank})`);
      continue;
    }
    // Stable order: by acquired date if any, then by id
    const sorted = [...list].sort((a, b) => {
      const ay = a.acquired_year ?? 9999;
      const by = b.acquired_year ?? 9999;
      if (ay !== by) return ay - by;
      const am = a.acquired_month ?? 99;
      const bm = b.acquired_month ?? 99;
      if (am !== bm) return am - bm;
      return a.id - b.id;
    });
    sorted.forEach((c, i) => {
      const dated = c.acquired_year
        ? `acquired ${c.acquired_month ? monthNames[c.acquired_month - 1] + ' ' : ''}${c.acquired_year}`
        : `#${String.fromCharCode(65 + i)}`;
      labels.set(c.id, `${name} (${c.bank}) — ${dated}`);
    });
  }
  return labels;
}

// Heuristic: if the Plaid account is a credit card AND the user has exactly one
// wallet card from a bank whose name shares a token with the institution name,
// suggest it. Conservative on purpose — sandbox account names are useless for
// matching, and we'd rather show no suggestion than a wrong one.
function suggestedWalletCardId(account: PlaidAccount, walletCards: WalletCard[], institutionName: string | null): number | null {
  if (account.user_card_id != null) return null; // already mapped
  const isCreditCard =
    account.account_type === 'credit' || account.account_subtype === 'credit card';
  if (!isCreditCard) return null;
  if (!institutionName) return null;

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  const instTokens = new Set(norm(institutionName));
  const matches = walletCards.filter((c) => {
    const bankTokens = norm(c.bank || '');
    return bankTokens.some((t) => instTokens.has(t));
  });
  return matches.length === 1 ? matches[0].id : null;
}

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

export default function PlaidConnect({ walletCards, allCards }: PlaidConnectProps) {
  const { getToken } = useAuth();
  const pickerLabels = buildPickerLabels(walletCards);
  const cardById = new Map(allCards.map((c) => [c.card_id, c] as [number, Card]));
  const [items, setItems] = useState<PlaidItem[]>([]);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [savingMappingId, setSavingMappingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentTxns, setRecentTxns] = useState<PlaidTransaction[]>([]);
  const [summaries, setSummaries] = useState<PlaidSpendSummary[]>([]);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const [next, txns, summary] = await Promise.all([
        getPlaidItems(token),
        getPlaidTransactions(token, { limit: 10 }).catch(() => ({ transactions: [], total: 0, limit: 10, offset: 0 })),
        getPlaidSpendSummary(token).catch(() => ({ summaries: [] })),
      ]);
      setItems(next);
      setRecentTxns(txns.transactions);
      setSummaries(summary.summaries);
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

  const handleMappingChange = async (accountRowId: number, raw: string) => {
    setError(null);
    setSavingMappingId(accountRowId);
    const userCardId = raw === '' ? null : Number(raw);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      await setPlaidAccountCard(accountRowId, userCardId, token);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save mapping');
    } finally {
      setSavingMappingId(null);
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
                padding: '12px 16px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
              </div>

              {item.accounts.length > 0 && (
                <ul style={{ listStyle: 'none', padding: '12px 0 0 0', margin: '12px 0 0 0', borderTop: '1px solid #f3f4f6' }}>
                  {item.accounts.map((account) => {
                    const suggested = suggestedWalletCardId(account, walletCards, item.institution_name);
                    const summary = summaries.find((s) => s.account_id === account.id);
                    const walletCard = account.user_card_id != null ? walletCards.find((c) => c.id === account.user_card_id) : undefined;
                    const card = walletCard ? cardById.get(walletCard.card_id) : undefined;
                    const byCat = summary ? bucketsByCategory(summary) : null;
                    return (
                      <li key={account.id} style={{ padding: '8px 0', fontSize: 13 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 500 }}>
                              {account.account_official_name || account.account_name || 'Account'}
                              {account.mask ? <span style={{ color: 'var(--muted, #6b7280)', marginLeft: 6 }}>··· {account.mask}</span> : null}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--muted, #6b7280)', textTransform: 'capitalize' }}>
                              {account.account_subtype || account.account_type || 'unknown type'}
                              {account.last_statement_issue_date ? (
                                <> · stmt closed {account.last_statement_issue_date}</>
                              ) : null}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {suggested != null && account.user_card_id == null && (
                              <button
                                type="button"
                                onClick={() => handleMappingChange(account.id, String(suggested))}
                                disabled={savingMappingId === account.id}
                                style={{
                                  fontSize: 11,
                                  padding: '3px 8px',
                                  borderRadius: 999,
                                  background: '#fef3c7',
                                  color: '#92400e',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                }}
                                title="Apply suggested wallet card"
                              >
                                Suggested: {pickerLabels.get(suggested) ?? walletCards.find((c) => c.id === suggested)?.card_name}
                              </button>
                            )}
                            <select
                              value={account.user_card_id ?? ''}
                              onChange={(e) => handleMappingChange(account.id, e.target.value)}
                              disabled={savingMappingId === account.id}
                              aria-label={`Map ${account.account_name || 'account'} to wallet card`}
                              style={{
                                fontSize: 12,
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid #d1d5db',
                                background: 'white',
                                maxWidth: 280,
                              }}
                            >
                              <option value="">— Not mapped —</option>
                              {walletCards.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {pickerLabels.get(c.id) ?? c.card_name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {summary && byCat && byCat.size > 0 && (
                          <div
                            style={{
                              marginTop: 10,
                              padding: '10px 12px',
                              background: '#f9fafb',
                              borderRadius: 6,
                              fontSize: 12,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: 'var(--muted, #6b7280)' }}>
                              <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                This cycle
                              </span>
                              <span>
                                {summary.cycle_start} – {summary.cycle_end}
                                {summary.cycle_source === 'calendar_month' ? ' (calendar fallback)' : ''}
                              </span>
                            </div>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                              {Array.from(byCat.entries())
                                .sort((a, b) => b[1].spend - a[1].spend)
                                .map(([categoryId, agg]) => {
                                  const reward = rewardForCategory(card, categoryId);
                                  const pct = reward?.cap ? Math.min(100, (agg.spend / reward.cap) * 100) : null;
                                  return (
                                    <li key={categoryId} style={{ marginBottom: 6 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>
                                          <span style={{ fontWeight: 500 }}>{categoryLabel(categoryId)}</span>
                                          {' '}
                                          <span style={{ color: 'var(--muted, #6b7280)' }}>
                                            ({agg.txnCount} txn{agg.txnCount === 1 ? '' : 's'})
                                          </span>
                                          {reward ? (
                                            <span style={{ marginLeft: 8, fontSize: 11, color: '#4338ca' }}>
                                              {reward.rate}{reward.unit === 'cash_back' ? '%' : 'x'}
                                              {reward.cap ? ` · cap $${reward.cap.toLocaleString()}${reward.capPeriod ? '/' + reward.capPeriod : ''}` : ''}
                                            </span>
                                          ) : null}
                                        </span>
                                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                          ${agg.spend.toFixed(2)}
                                        </span>
                                      </div>
                                      {pct != null && reward?.cap && (
                                        <div
                                          style={{
                                            marginTop: 4,
                                            height: 4,
                                            background: '#e5e7eb',
                                            borderRadius: 2,
                                            overflow: 'hidden',
                                          }}
                                        >
                                          <div
                                            style={{
                                              width: `${pct}%`,
                                              height: '100%',
                                              background: pct >= 95 ? '#dc2626' : pct >= 70 ? '#d97706' : '#059669',
                                              transition: 'width 200ms',
                                            }}
                                          />
                                        </div>
                                      )}
                                    </li>
                                  );
                                })}
                            </ul>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
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
