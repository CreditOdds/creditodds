import {
  GlobeAltIcon,
  ShoppingBagIcon,
  TruckIcon,
  SparklesIcon,
  FireIcon,
  HomeModernIcon,
  FilmIcon,
  ComputerDesktopIcon,
  CreditCardIcon,
} from "@heroicons/react/24/outline";
import { Card, CardBenefit, Reward } from "@/lib/api";
import { getValuation } from "@/lib/valuations";

export const categoryLabels: Record<string, string> = {
  dining: "Dining",
  groceries: "Groceries",
  travel: "Travel",
  gas: "Gas",
  streaming: "Streaming",
  transit: "Transit",
  drugstores: "Drugstores",
  home_improvement: "Home Improvement",
  online_shopping: "Online Shopping",
  hotels: "Hotels",
  airlines: "Airlines",
  car_rentals: "Car Rentals",
  entertainment: "Entertainment",
  rotating: "Rotating Categories",
  top_category: "Top Spend Category",
  selected_categories: "Selected Categories",
  travel_portal: "Travel (via Portal)",
  hotels_portal: "Hotels (via Portal)",
  flights_portal: "Flights (via Portal)",
  hotels_car_portal: "Hotels & Car Rentals (via Portal)",
  car_rentals_portal: "Car Rentals (via Portal)",
  amazon: "Amazon.com",
  rei: "REI",
  everything_else: "Everything Else",
};

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const iconClass = className || "h-5 w-5";
  switch (category) {
    case "dining":
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v7a3 3 0 003 3v0a3 3 0 003-3V3M7 3H5m2 0h2m0 0h2m0 0h2M10 13v8m0 0H8m2 0h2M17 3v4a2 2 0 01-2 2v0a2 2 0 01-2-2V3m2 18V9" />
        </svg>
      );
    case "groceries":
      return <ShoppingBagIcon className={iconClass} />;
    case "travel":
    case "travel_portal":
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L10.93 3.555a1.126 1.126 0 00-1.006 0L2.547 7.242A1.125 1.125 0 002 8.185v11.264c0 .756.794 1.245 1.473.89l4.23-2.21a1.126 1.126 0 011.006 0l3.86 2.02a1.126 1.126 0 001.006 0l2.928-1.533z" />
        </svg>
      );
    case "gas":
      return <FireIcon className={iconClass} />;
    case "streaming":
      return <ComputerDesktopIcon className={iconClass} />;
    case "transit":
      return <TruckIcon className={iconClass} />;
    case "drugstores":
      return <CreditCardIcon className={iconClass} />;
    case "home_improvement":
      return <HomeModernIcon className={iconClass} />;
    case "online_shopping":
    case "amazon":
    case "rei":
      return <ShoppingBagIcon className={iconClass} />;
    case "hotels":
    case "hotels_portal":
    case "hotels_car_portal":
      return <HomeModernIcon className={iconClass} />;
    case "airlines":
    case "flights_portal":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0011.5 2 1.5 1.5 0 0010 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
      );
    case "car_rentals":
    case "car_rentals_portal":
      return <TruckIcon className={iconClass} />;
    case "entertainment":
      return <FilmIcon className={iconClass} />;
    case "rotating":
    case "top_category":
    case "selected_categories":
      return <SparklesIcon className={iconClass} />;
    case "everything_else":
      return <GlobeAltIcon className={iconClass} />;
    default:
      return <CreditCardIcon className={iconClass} />;
  }
}

// Benefit value rendering helpers — distinguishes USD-valued benefits from
// points/miles-valued ones so a "10,000 points" Companion Pass Boost doesn't
// render as "$10,000" or get summed into Total Annual Credits.
export function isMonetaryBenefit(benefit: { value_unit?: string }): boolean {
  return !benefit.value_unit || benefit.value_unit === 'usd';
}

export function formatBenefitValue(benefit: CardBenefit): string {
  const v = benefit.value.toLocaleString();
  if (benefit.value_unit === 'points') return `${v} points`;
  if (benefit.value_unit === 'miles') return `${v} miles`;
  return `$${v}`;
}

// Default cycle length for `multi_year` benefits when `frequency_years` is
// missing — covers existing Global Entry/TSA PreCheck entries that didn't
// specify a cycle. New entries should set `frequency_years` explicitly.
export const DEFAULT_MULTI_YEAR_CYCLE = 4;

// Per-year USD contribution of a benefit, used to roll up "Total Annual
// Credits" across all monetary benefits on a card.
//
// CONVENTION: `value` is always the ANNUAL TOTAL — the dollar amount the
// cardholder gets in a typical 12-month period. `frequency` is a display
// hint (renders "$15/mo", "$50/qtr", "$200/6 mo", etc.) and is NOT used as
// a multiplier. This matches every existing hand-curated card YAML:
//
//   Amex Platinum Uber Cash:   value: 200,  frequency: monthly  → $200/yr
//   Amex Platinum Equinox:     value: 300,  frequency: monthly  → $300/yr
//   Hilton Aspire Flight:      value: 200,  frequency: quarterly → $200/yr
//   Amex Biz Plat Indeed:      value: 360,  frequency: quarterly → $360/yr
//   Hilton Aspire Resort:      value: 800,  frequency: semi_annual (covered
//     by `frequency_years` for multi-year, by raw value otherwise — annual)
//
// Cycle handling:
//   - monthly / quarterly / semi_annual / annual → value (the annual total)
//   - multi_year → value ÷ frequency_years (default 4) — value is the
//     amount per cycle, e.g. $120 every 5 years for Global Entry → $24/yr.
//   - ongoing → 0 (no quantifiable per-year amount)
//   - per_purchase / per_flight / per_trip / etc. → 0 (usage unknown)
//
// History: an earlier (incorrect) version of this function multiplied
// monthly/quarterly/semi_annual values by their occurrence count, which
// inflated the wallet/profile annual totals 12×/4×/2× across most cards
// because the YAMLs already store the annual total. Reverted.
export function amortizedAnnualValue(benefit: CardBenefit): number {
  if (!isMonetaryBenefit(benefit)) return 0;
  switch (benefit.frequency) {
    case 'monthly':
    case 'quarterly':
    case 'semi_annual':
    case 'annual':
      return benefit.value;
    case 'multi_year': {
      const years = benefit.frequency_years || DEFAULT_MULTI_YEAR_CYCLE;
      return Math.round(benefit.value / years);
    }
    case 'ongoing': return 0;
    // per_purchase, per_flight, per_trip, per_visit, per_rental, per_claim,
    // one_time — usage frequency unknown, can't roll up annually.
    default: return 0;
  }
}

// Human-readable frequency label shown next to a benefit's value in the UI.
//
// Because `value` is the ANNUAL TOTAL (see amortizedAnnualValue), all
// sub-annual frequencies render as "/yr" — e.g. Amex Platinum Uber Cash
// (value: 200, frequency: monthly) shows as "$200/yr", with the cadence
// ("$15/month...") communicated in the description. Showing "$200/mo" was
// the bug — that read as $2,400/yr to the user.
//
// `multi_year` is dynamic — "every N yr" using the benefit's
// `frequency_years` field (default 4 for legacy Global Entry entries).
export function frequencyLabel(benefit: CardBenefit): string {
  switch (benefit.frequency) {
    case 'monthly':
    case 'quarterly':
    case 'semi_annual':
    case 'annual':
      return '/yr';
    case 'multi_year': {
      const years = benefit.frequency_years || DEFAULT_MULTI_YEAR_CYCLE;
      return `every ${years} yr`;
    }
    case 'ongoing': return '';
    default: return '';
  }
}

// Cents-per-point estimates by program (driven by data/valuations.yaml)
export function getCentsPerPoint(card: Card): number | null {
  if (!card.signup_bonus) return null;
  const { type } = card.signup_bonus;
  if (type === 'cash' || type === 'cashback') return null;
  return getValuation(card.card_name);
}

export function formatEstimatedValue(card: Card): string | null {
  if (!card.signup_bonus) return null;
  if (typeof card.signup_bonus.value !== 'number') return null;
  if (card.signup_bonus.type === 'free_nights') return null;
  const cpp = getCentsPerPoint(card);
  if (cpp === null) return null;
  const value = Math.round((card.signup_bonus.value * cpp) / 100);
  return `~$${value.toLocaleString()}`;
}

export function formatBonusValue(card: Card): string {
  if (!card.signup_bonus) return '';
  const { value, type } = card.signup_bonus;
  if (type === 'cash' || type === 'cashback') {
    return `$${value.toLocaleString()}`;
  }
  if (type === 'free_nights') {
    return `${value} Free Night Award${value !== 1 ? 's' : ''}`;
  }
  if (typeof value !== 'number') return String(value);
  return `${value.toLocaleString()} ${type}`;
}

export function formatBonusRequirement(card: Card): string {
  if (!card.signup_bonus) return '';
  const { spend_requirement, timeframe_months } = card.signup_bonus;
  return `after $${spend_requirement.toLocaleString()} in ${timeframe_months} month${timeframe_months !== 1 ? 's' : ''}`;
}

export function formatAnnualFee(fee: number | undefined): string {
  if (fee === undefined || fee === null) return 'N/A';
  if (fee === 0) return '$0';
  return `$${fee}`;
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2).replace(/\.?0+$/, '');
}

// Normalizes reward rate into cash-equivalent percentage (value per $1 spent).
// Example: 5x points at 0.5 cpp => 2.5 (%)
export function getRewardUsdRate(reward: Reward, card: Card): number {
  if (reward.unit === 'percent') return reward.value;
  const cpp = getValuation(card.card_name);
  return reward.value * cpp;
}

export function formatRewardWithUsdEquivalent(reward: Reward | undefined, card: Card): string {
  if (!reward) return '\u2014';
  const raw = reward.unit === 'percent' ? `${reward.value}%` : `${reward.value}x`;
  if (reward.unit === 'percent') return raw;
  const usdRate = getRewardUsdRate(reward, card);
  return `${raw} (~${formatPercent(usdRate)}%)`;
}

export function RewardTypeBadge({ type }: { type?: string }) {
  if (!type) return null;
  const colors: Record<string, string> = {
    cashback: 'bg-green-100 text-green-800',
    points: 'bg-blue-100 text-blue-800',
    miles: 'bg-purple-100 text-purple-800',
  };
  const labels: Record<string, string> = {
    cashback: 'Cash Back',
    points: 'Points',
    miles: 'Miles',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[type] || 'bg-gray-100 text-gray-800'}`}>
      {labels[type] || type}
    </span>
  );
}
