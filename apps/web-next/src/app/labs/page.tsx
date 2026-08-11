import { Metadata } from 'next';
import Link from 'next/link';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import { V2Footer } from '@/components/landing-v2/Chrome';
import { PAZE_MERCHANTS } from './paze-tracker/merchants';
import '../landing.css';

export const metadata: Metadata = {
  title: 'Labs',
  description:
    'Experiments from CreditOdds. Trackers and tools for the parts of the payments world nobody documents properly.',
  openGraph: {
    title: 'Labs | CreditOdds',
    description: 'Experiments and trackers from CreditOdds.',
    url: 'https://creditodds.com/labs',
    type: 'website',
  },
  alternates: {
    canonical: 'https://creditodds.com/labs',
  },
};

interface Lab {
  name: string;
  description: string;
  href: string;
  /** Short right-aligned stat, the way /tools shows cents per point. */
  stat: string;
}

const labs: Lab[] = [
  {
    name: 'Paze Tracker',
    description:
      'Every merchant that accepts Paze, plus how it actually works at each one: reload caps, timing rules, and live Paze offers.',
    href: '/labs/paze-tracker',
    stat: `${PAZE_MERCHANTS.length} merchants`,
  },
];

export default function LabsPage() {
  return (
    <div className="landing-v2 labs-v2">
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: 'Labs', url: 'https://creditodds.com/labs' },
        ]}
      />

      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <span className="cj-crumb cj-crumb-current" aria-current="page">Labs</span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span><span className="cj-status-dot" />{labs.length} live</span>
        </div>
      </div>

      <section className="page-hero wrap">
        <h1 className="page-title">
          Labs. <em>Work in progress.</em>
        </h1>
        <p className="page-sub">
          Experiments we are building in the open. Rougher than the calculators in
          Tools, and changing week to week.
        </p>
      </section>

      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 64 }}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {labs.map((lab) => (
            <Link
              key={lab.href}
              href={lab.href}
              className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-gray-900 group-hover:text-indigo-600 truncate">
                  {lab.name}
                </h2>
                <span className="inline-flex items-center rounded-md px-2 py-1 text-sm font-semibold ring-1 ring-inset bg-indigo-50 text-indigo-700 ring-indigo-600/20 whitespace-nowrap">
                  {lab.stat}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">{lab.description}</p>
            </Link>
          ))}
        </div>
      </div>

      <V2Footer />
    </div>
  );
}
