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
import { Card } from "@/lib/api";

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
  travel_portal: "Travel (via Portal)",
  hotels_portal: "Hotels (via Portal)",
  flights_portal: "Flights (via Portal)",
  hotels_car_portal: "Hotels & Car Rentals (via Portal)",
  amazon: "Amazon.com",
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
      return <TruckIcon className={iconClass} />;
    case "entertainment":
      return <FilmIcon className={iconClass} />;
    case "rotating":
      return <SparklesIcon className={iconClass} />;
    case "everything_else":
      return <GlobeAltIcon className={iconClass} />;
    default:
      return <CreditCardIcon className={iconClass} />;
  }
}

// Cents-per-point estimates by program (conservative baseline values)
export function getCentsPerPoint(card: Card): number | null {
  if (!card.signup_bonus) return null;
  const { type } = card.signup_bonus;
  if (type === 'cash' || type === 'cashback') return null;

  const name = card.card_name.toLowerCase();
  if (name.includes('chase sapphire') || name.includes('freedom')) return 1.25;
  if (name.includes('amex') || name.includes('american express') || name.includes('gold card') || name.includes('platinum card')) {
    if (name.includes('delta') || name.includes('skymiles')) return 1.1;
    if (name.includes('hilton')) return 0.5;
    return 1.2;
  }
  if (name.includes('capital one')) return 1.0;
  if (name.includes('hyatt')) return 2.0;
  if (name.includes('ihg')) return 0.5;
  if (name.includes('marriott') || name.includes('bonvoy')) return 0.7;
  if (name.includes('atmos')) return 1.0;
  if (name.includes('bilt')) return 1.5;
  if (name.includes('citi')) return 1.0;
  if (name.includes('wells fargo')) return 1.0;

  return 1.0;
}

export function formatEstimatedValue(card: Card): string | null {
  if (!card.signup_bonus) return null;
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
