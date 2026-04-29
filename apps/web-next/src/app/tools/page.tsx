import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import { V2Footer } from '@/components/landing-v2/Chrome';
import '../landing.css';

export const metadata: Metadata = {
  title: 'Tools | CreditOdds',
  description: 'Free credit card tools and calculators. Convert miles and points to dollars for Chase, Amex, Delta, United, Southwest, Capital One, Marriott, Hilton, Hyatt, IHG, Bilt, and Citi.',
};

interface Tool {
  name: string;
  description: string;
  href: string;
  cpp: number;
  unit: 'point' | 'mile';
  logo: string;
}

interface ToolCategory {
  label: string;
  tools: Tool[];
}

const categories: ToolCategory[] = [
  {
    label: 'Bank Points',
    tools: [
      { name: 'Chase Ultimate Rewards', description: 'Convert Chase UR points to dollars.', href: '/tools/chase-ultimate-rewards-to-usd', cpp: 1.25, unit: 'point', logo: '/logos/chase.jpg' },
      { name: 'Amex Membership Rewards', description: 'Convert Amex MR points to dollars.', href: '/tools/amex-membership-rewards-to-usd', cpp: 1.2, unit: 'point', logo: '/logos/amex.jpg' },
      { name: 'Capital One Miles', description: 'Convert Capital One miles to dollars.', href: '/tools/capital-one-miles-to-usd', cpp: 1.0, unit: 'mile', logo: '/logos/capital-one.jpg' },
      { name: 'Citi ThankYou Points', description: 'Convert Citi ThankYou points to dollars.', href: '/tools/citi-thankyou-points-to-usd', cpp: 1.0, unit: 'point', logo: '/logos/citi.png' },
      { name: 'Bilt Rewards', description: 'Convert Bilt Rewards points to dollars.', href: '/tools/bilt-rewards-points-to-usd', cpp: 1.5, unit: 'point', logo: '/logos/bilt.jpg' },
    ],
  },
  {
    label: 'Airline Miles',
    tools: [
      { name: 'United MileagePlus', description: 'Convert United MileagePlus miles to dollars.', href: '/tools/united-miles-to-usd', cpp: 1.2, unit: 'mile', logo: '/logos/united.jpg' },
      { name: 'Delta SkyMiles', description: 'Convert Delta SkyMiles to dollars.', href: '/tools/delta-skymiles-to-usd', cpp: 1.1, unit: 'mile', logo: '/logos/delta.jpg' },
      { name: 'Southwest Rapid Rewards', description: 'Convert Southwest points to dollars.', href: '/tools/southwest-rapid-rewards-to-usd', cpp: 1.4, unit: 'point', logo: '/logos/southwest.jpg' },
    ],
  },
  {
    label: 'Hotel Points',
    tools: [
      { name: 'World of Hyatt', description: 'Convert World of Hyatt points to dollars.', href: '/tools/world-of-hyatt-points-to-usd', cpp: 2.0, unit: 'point', logo: '/logos/hyatt.jpg' },
      { name: 'Marriott Bonvoy', description: 'Convert Marriott Bonvoy points to dollars.', href: '/tools/marriott-bonvoy-points-to-usd', cpp: 0.7, unit: 'point', logo: '/logos/marriott.jpg' },
      { name: 'Hilton Honors', description: 'Convert Hilton Honors points to dollars.', href: '/tools/hilton-honors-points-to-usd', cpp: 0.5, unit: 'point', logo: '/logos/hilton.jpg' },
      { name: 'IHG One Rewards', description: 'Convert IHG One Rewards points to dollars.', href: '/tools/ihg-one-rewards-points-to-usd', cpp: 0.5, unit: 'point', logo: '/logos/ihg.jpg' },
    ],
  },
];

function cppColor(cpp: number): string {
  if (cpp >= 1.5) return 'text-emerald-700 bg-emerald-50 ring-emerald-600/20';
  if (cpp >= 1.0) return 'text-indigo-700 bg-indigo-50 ring-indigo-600/20';
  return 'text-gray-600 bg-gray-50 ring-gray-500/20';
}

function CppBadge({ cpp, unit }: { cpp: number; unit: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-sm font-semibold ring-1 ring-inset ${cppColor(cpp)}`}>
      {cpp.toFixed(1)}¢/{unit}
    </span>
  );
}

function BrandIcon({ tool }: { tool: Tool }) {
  return (
    <div className="flex-shrink-0 h-10 w-10 rounded-lg overflow-hidden bg-gray-100">
      <Image src={tool.logo} alt={tool.name} width={40} height={40} className="object-cover w-full h-full" />
    </div>
  );
}

export default function ToolsPage() {
  const totalTools = categories.reduce((acc, c) => acc + c.tools.length, 0);

  return (
    <div className="landing-v2 tools-v2">
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: 'Tools', url: 'https://creditodds.com/tools' },
        ]}
      />

      <section className="page-hero wrap">
        <h1 className="page-title">
          Free calculators. <em>Real math.</em>
        </h1>
        <p className="page-sub">
          Convert bank points, airline miles, and hotel points to dollars using the
          valuations that actually hold up in practice.
        </p>
      </section>

      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 64 }}>
        {categories.map((category) => (
          <div key={category.label} className="mt-10">
            <h2
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11.5,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                margin: '0 0 16px',
              }}
            >
              {category.label}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {category.tools.map((tool) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow group flex items-start gap-4"
                >
                  <BrandIcon tool={tool} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-gray-900 group-hover:text-indigo-600 truncate">
                        {tool.name}
                      </h3>
                      <CppBadge cpp={tool.cpp} unit={tool.unit} />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{tool.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <V2Footer />
    </div>
  );
}
