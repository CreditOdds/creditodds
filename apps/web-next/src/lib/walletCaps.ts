// Compute "did this wallet card hit its category cap this cycle?" from the
// Plaid spend summary. Used in three places:
//   - profile wallet detail panel  → progress bars + "this cycle" totals
//   - BestCardHere                  → demote/swap recommendations
//   - BestCardByCategory            → same (future)
//
// Spend is aggregated across all Plaid accounts mapped to one wallet row.
// (We don't roll up duplicates of the same card_id — each wallet row stands
// alone, since each is a separate physical card with its own statement.)

import type { Card, WalletCard, PlaidSpendSummary } from '@/lib/api';
import { pfcToCategory } from '@/lib/plaidPfc';

export interface CapState {
  category: string;
  rate: number;
  unit: string;       // 'percent' | 'points_per_dollar' | 'cash_back' etc — pulled raw from card YAML
  spend: number;
  cap: number;
  capPeriod: string;  // 'annual' | 'quarterly' | 'monthly' (from card YAML)
  percent: number;    // 0..100 (clamped)
  status: 'ok' | 'amber' | 'red';
}

export interface CategorySpend {
  category: string;
  spend: number;
  txnCount: number;
}

function statusFor(percent: number): CapState['status'] {
  if (percent >= 95) return 'red';
  if (percent >= 70) return 'amber';
  return 'ok';
}

// Map summary buckets to {category → {spend, txnCount}}. Uses the same
// PFC → CreditOdds mapping as PlaidConnect so numbers match across surfaces.
export function spendByCategoryForWalletCard(
  walletCardId: number,
  summaries: PlaidSpendSummary[]
): Map<string, CategorySpend> {
  const out = new Map<string, CategorySpend>();
  const summary = summaries.find((s) => s.user_card_id === walletCardId);
  if (!summary) return out;
  for (const b of summary.buckets) {
    const cat = pfcToCategory(b.pfc_primary, b.pfc_detailed);
    const existing = out.get(cat) || { category: cat, spend: 0, txnCount: 0 };
    existing.spend += Number(b.spend) || 0;
    existing.txnCount += b.txn_count;
    out.set(cat, existing);
  }
  return out;
}

// Cap states for every reward on the catalog card that has a spend_cap set.
// Returns an empty array when the card has no caps OR there's no Plaid data
// for this wallet row — caller can use that to skip rendering the section.
export function capStateForWalletCard(
  walletCard: WalletCard,
  card: Card | undefined,
  summaries: PlaidSpendSummary[]
): CapState[] {
  if (!card?.rewards) return [];
  const spendByCat = spendByCategoryForWalletCard(walletCard.id, summaries);
  if (spendByCat.size === 0) return [];

  const out: CapState[] = [];
  for (const reward of card.rewards) {
    if (!reward.spend_cap) continue;
    const spend = spendByCat.get(reward.category)?.spend ?? 0;
    const percent = Math.min(100, (spend / reward.spend_cap) * 100);
    out.push({
      category: reward.category,
      rate: reward.value,
      unit: reward.unit,
      spend,
      cap: reward.spend_cap,
      capPeriod: reward.cap_period || 'annual',
      percent,
      status: statusFor(percent),
    });
  }
  return out;
}

// Worst (highest-percent) cap state across all caps on the wallet card.
// Used by the collapsed wallet row to decide whether to show a badge.
export function worstCapState(states: CapState[]): CapState | null {
  if (states.length === 0) return null;
  return [...states].sort((a, b) => b.percent - a.percent)[0];
}

// "Has this card hit its cap on `category`?" — used by BCH to decide whether
// to demote a recommendation. Hit threshold is 95% (matches the "red" state).
// If no cap exists for that category, returns false (no demotion).
export function isCapped(
  walletCardId: number,
  card: Card | undefined,
  category: string,
  summaries: PlaidSpendSummary[]
): boolean {
  if (!card?.rewards) return false;
  const reward = card.rewards.find((r) => r.category === category);
  if (!reward?.spend_cap) return false;
  const spend = spendByCategoryForWalletCard(walletCardId, summaries).get(category)?.spend ?? 0;
  return (spend / reward.spend_cap) >= 0.95;
}
