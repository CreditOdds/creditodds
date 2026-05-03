import { Metadata } from "next";
import Link from "next/link";
import { getAllStores, type Store } from "@/lib/stores";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../landing.css";

export const metadata: Metadata = {
  title: "Best Credit Card by Store",
  description:
    "Find the best credit card to use at every major U.S. retailer we track — from Costco and Amazon to Whole Foods and Macy's. Cards ranked by category bonuses, co-brand benefits, and honest caveats.",
  openGraph: {
    title: "Best Credit Card by Store | CreditOdds",
    description:
      "Find the best credit card to use at every major U.S. retailer — from Costco and Amazon to Whole Foods and Macy's.",
    url: "https://creditodds.com/best-card-for",
    type: "website",
  },
  alternates: {
    canonical: "https://creditodds.com/best-card-for",
  },
};

// Curated display order — high-traffic / clearest-answer categories first,
// then the long tail. Keeps the most-searched buckets above the fold.
const CATEGORY_ORDER: string[] = [
  'wholesale_clubs',
  'online_shopping',
  'amazon',
  'department_stores',
  'groceries',
  'home_improvement',
  'drugstores',
  'gas',
  'dining',
];

const CATEGORY_LABELS: Record<string, string> = {
  wholesale_clubs: 'Wholesale Clubs',
  online_shopping: 'Online Retail',
  amazon: 'Amazon',
  department_stores: 'Department Stores',
  groceries: 'Groceries',
  home_improvement: 'Home Improvement',
  drugstores: 'Drugstores',
  gas: 'Gas Stations',
  dining: 'Dining & Delivery',
};

function categoryLabel(id: string): string {
  return (
    CATEGORY_LABELS[id]
    || id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  );
}

function categoryRank(id: string): number {
  const idx = CATEGORY_ORDER.indexOf(id);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

interface StoreGroup {
  category: string;
  label: string;
  stores: Store[];
}

function groupByPrimaryCategory(stores: Store[]): StoreGroup[] {
  const buckets = new Map<string, Store[]>();
  for (const s of stores) {
    const primary = s.categories[0] || 'other';
    if (!buckets.has(primary)) buckets.set(primary, []);
    buckets.get(primary)!.push(s);
  }
  const groups: StoreGroup[] = [];
  for (const [category, list] of buckets) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ category, label: categoryLabel(category), stores: list });
  }
  // Curated ordering: known high-traffic categories first, then alphabetical.
  groups.sort((a, b) => {
    const ra = categoryRank(a.category);
    const rb = categoryRank(b.category);
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label);
  });
  return groups;
}

export default async function BestCardForIndexPage() {
  const stores = await getAllStores();
  const groups = groupByPrimaryCategory(stores);

  return (
    <div className="landing-v2 store-v2">
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: 'Best Credit Card by Store', url: 'https://creditodds.com/best-card-for' },
        ]}
      />

      <section className="page-hero wrap">
        <h1 className="page-title">
          Best credit card by store<em>.</em>
        </h1>
        <p className="page-sub">
          The best credit card to use at every major U.S. retailer we track — ranked by
          real category bonuses, co-brand benefits, and honest caveats about activation,
          spend caps, and merchant-specific gotchas.
        </p>
        <p className="page-sub" style={{ marginTop: 8, fontSize: 14, color: 'var(--muted)' }}>
          {stores.length} {stores.length === 1 ? 'store' : 'stores'} across {groups.length}{' '}
          {groups.length === 1 ? 'category' : 'categories'}.
        </p>
      </section>

      <div className="wrap store-body">
        {groups.map(g => (
          <section key={g.category} className="store-index-group">
            <h2 className="store-index-heading">{g.label}</h2>
            <ul className="store-index-list">
              {g.stores.map(s => (
                <li key={s.slug} className="store-index-item">
                  <Link href={`/best-card-for/${s.slug}`} className="store-index-link">
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <V2Footer />
    </div>
  );
}
