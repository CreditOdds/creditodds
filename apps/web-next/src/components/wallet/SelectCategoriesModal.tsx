'use client';

import { useEffect, useMemo, useState } from 'react';
import CardImage from '@/components/ui/CardImage';
import { XMarkIcon } from '@heroicons/react/24/outline';
import {
  Card,
  Reward,
  WalletCard,
  WalletCardSelection,
  updateWalletCardSelections,
} from '@/lib/api';
import { categoryLabels } from '@/lib/cardDisplayUtils';
import { useAuth } from '@/auth/AuthProvider';

// Reward blocks the user must configure to unlock category bonuses.
// Includes both `mode: user_choice` (Cash+, Shopper) and `auto_top_spend`
// (Custom Cash, Venmo, Amex Business Gold) — from a UX perspective both
// require the user to tell us which category they normally pick / typically
// spend on.
function selectableRewards(card: Card): Reward[] {
  if (!card.rewards) return [];
  return card.rewards.filter(
    (r) =>
      r.mode === 'user_choice' ||
      r.mode === 'auto_top_spend' ||
      r.category === 'top_category',
  );
}

function labelFor(slug: string): string {
  return categoryLabels[slug] ?? slug.replace(/_/g, ' ');
}

function cadenceLabel(reward: Reward): string {
  switch (reward.cap_period) {
    case 'monthly':
      return 'each month';
    case 'quarterly':
      return 'each quarter';
    case 'billing_cycle':
      return 'each billing cycle';
    case 'annual':
      return 'each year';
    default:
      return '';
  }
}

interface SelectCategoriesModalProps {
  show: boolean;
  walletCard: WalletCard | null;
  card: Card | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface BlockState {
  reward_category: string;
  reward_rate: number;
  picks: number;
  eligible: string[];
  selected: string[];
  reward: Reward;
}

export default function SelectCategoriesModal({
  show,
  walletCard,
  card,
  onClose,
  onSuccess,
}: SelectCategoriesModalProps) {
  const { getToken } = useAuth();
  const [blocks, setBlocks] = useState<BlockState[]>([]);
  const [autoRenew, setAutoRenew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rewards = useMemo(() => (card ? selectableRewards(card) : []), [card]);

  useEffect(() => {
    if (!walletCard || !card) {
      setBlocks([]);
      setAutoRenew(false);
      setError(null);
      return;
    }
    const existing = walletCard.selections || [];
    const initial: BlockState[] = rewards.map((r) => {
      const eligible = r.eligible_categories || [];
      // Prefill from saved selections matching this block.
      const prefill = existing
        .filter((s) => s.reward_category === r.category && s.reward_rate === r.value)
        .map((s) => s.selected_category)
        .filter((c) => eligible.includes(c));
      return {
        reward_category: r.category,
        reward_rate: r.value,
        picks: r.choices ?? 1,
        eligible,
        selected: prefill,
        reward: r,
      };
    });
    setBlocks(initial);
    setAutoRenew(existing.some((s) => s.auto_renew));
    setError(null);
  }, [walletCard, card, rewards]);

  if (!show || !walletCard || !card) return null;

  const togglePick = (blockIdx: number, category: string) => {
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i === blockIdx) {
          const has = b.selected.includes(category);
          if (has) return { ...b, selected: b.selected.filter((c) => c !== category) };
          if (b.selected.length >= b.picks) {
            // Bump the oldest pick out so the click feels responsive — the user
            // is replacing one of their picks rather than hitting a hard cap.
            return { ...b, selected: [...b.selected.slice(1), category] };
          }
          return { ...b, selected: [...b.selected, category] };
        }
        // Cross-block dedup: a category claimed in one block (e.g. Venmo's 3%
        // tier) can't also be the pick for a sibling block (the 2% tier),
        // since the issuer ranks tiers off the user's actual spend.
        if (b.selected.includes(category)) {
          return { ...b, selected: b.selected.filter((c) => c !== category) };
        }
        return b;
      }),
    );
  };

  const incomplete = blocks.some((b) => b.selected.length !== b.picks);

  const handleSave = async () => {
    if (!walletCard) return;
    if (incomplete) {
      setError('Pick the required number of categories for every block before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('You need to be signed in.');
      const selections: WalletCardSelection[] = [];
      for (const b of blocks) {
        for (const cat of b.selected) {
          selections.push({
            reward_category: b.reward_category,
            reward_rate: b.reward_rate,
            selected_category: cat,
            auto_renew: autoRenew,
          });
        }
      }
      await updateWalletCardSelections(
        walletCard.id,
        {
          selections: selections.map((s) => ({
            reward_category: s.reward_category,
            reward_rate: s.reward_rate,
            selected_category: s.selected_category,
          })),
          auto_renew: autoRenew,
        },
        token,
      );
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save selections.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cj-modal-root" role="dialog" aria-modal="true">
      <div className="cj-modal-backdrop" onClick={saving ? undefined : onClose} />
      <div className="cj-modal-shell">
        <div className="cj-modal-card">
          <div className="cj-modal-head">
            <span className="cj-status-dot" />
            <span className="cj-modal-title">pick categories</span>
            <button
              type="button"
              className="cj-modal-close"
              onClick={onClose}
              aria-label="Close"
              disabled={saving}
            >
              <XMarkIcon style={{ width: 16, height: 16 }} />
            </button>
          </div>

          <div className="cj-modal-body">
            {error && <div className="cj-modal-error">{error}</div>}

            <div className="cj-modal-section">
              <div className="cj-modal-card-row">
                <span className="cj-modal-thumb">
                  <CardImage
                    cardImageLink={card.card_image_link}
                    alt={card.card_name}
                    fill
                    className="object-contain"
                    sizes="56px"
                  />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="cj-modal-card-name">{card.card_name}</div>
                  <div className="cj-modal-card-meta">{card.bank}</div>
                </div>
              </div>
            </div>

            {blocks.length === 0 ? (
              <div className="cj-modal-section" style={{ color: 'var(--muted)', fontSize: 13 }}>
                This card has no selectable bonus categories.
              </div>
            ) : (
              blocks.map((b, idx) => {
                const cad = cadenceLabel(b.reward);
                // Tier-aware heading when a card has multiple top_category
                // blocks (Venmo: 3% top tier, 2% second tier). Each tier
                // earns at a different rate on a distinct user-picked category.
                const topTierBlocks = blocks.filter(
                  (x) => x.reward_category === 'top_category',
                );
                const isTopTier = b.reward_category === 'top_category' && topTierBlocks.length > 1;
                const tierIdx = isTopTier
                  ? topTierBlocks.findIndex((x) => x === b)
                  : -1;
                const tierPrefix = isTopTier
                  ? tierIdx === 0
                    ? 'top tier — '
                    : tierIdx === 1
                      ? '2nd tier — '
                      : `${tierIdx + 1}th tier — `
                  : '';
                const heading = `${tierPrefix}${b.reward_rate}% — pick ${b.picks}${cad ? ` ${cad}` : ''}`;
                return (
                  <div className="cj-modal-section" key={`${b.reward_category}-${b.reward_rate}`}>
                    <label className="cj-modal-label">{heading}</label>
                    {b.eligible.length === 0 ? (
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                        Eligible categories aren&apos;t enumerated for this card yet.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {b.eligible.map((cat) => {
                          const active = b.selected.includes(cat);
                          return (
                            <button
                              type="button"
                              key={cat}
                              onClick={() => togglePick(idx, cat)}
                              className="cj-chip"
                              style={{
                                padding: '6px 10px',
                                fontSize: 12,
                                borderRadius: 999,
                                border: `1px solid ${active ? 'var(--accent)' : 'var(--line-2)'}`,
                                background: active ? 'var(--accent)' : 'var(--paper)',
                                color: active ? '#fff' : 'var(--ink)',
                                cursor: 'pointer',
                                letterSpacing: '0.01em',
                              }}
                            >
                              {labelFor(cat)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
                      {b.selected.length} of {b.picks} picked
                    </div>
                  </div>
                );
              })
            )}

            {blocks.length > 0 && (
              <div className="cj-modal-section">
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={autoRenew}
                    onChange={(e) => setAutoRenew(e.target.checked)}
                  />
                  <span>
                    Always pick these — don&apos;t ask me again each cycle.
                  </span>
                </label>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, marginLeft: 24 }}>
                  We&apos;ll keep these picks active going forward unless the issuer changes
                  the eligible list.
                </div>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'flex-end',
                paddingTop: 12,
                borderTop: '1px solid var(--line-2)',
              }}
            >
              <button
                type="button"
                className="cj-inline-cta"
                onClick={onClose}
                disabled={saving}
                style={{ padding: '7px 12px' }}
              >
                cancel
              </button>
              <button
                type="button"
                className="cj-bch-cta-btn"
                onClick={handleSave}
                disabled={saving || blocks.length === 0 || incomplete}
                style={{ padding: '7px 14px', fontSize: 12 }}
              >
                {saving ? 'saving…' : 'save picks'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
