import { Metadata } from 'next';
import Link from 'next/link';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'Tools | CreditOdds',
  description: 'Free credit card tools and calculators. Convert miles and points to dollars for Chase, Amex, Delta, United, Southwest, Capital One, Marriott, Hilton, Hyatt, IHG, Bilt, and Citi.',
};

const dollarIcon = (
  <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const tools = [
  {
    name: 'Chase Ultimate Rewards to USD',
    description: 'Convert Chase UR points to dollars. 1.25¢/point.',
    href: '/tools/chase-ultimate-rewards-to-usd',
  },
  {
    name: 'Amex Membership Rewards to USD',
    description: 'Convert Amex MR points to dollars. 1.2¢/point.',
    href: '/tools/amex-membership-rewards-to-usd',
  },
  {
    name: 'United Miles to USD',
    description: 'Convert United MileagePlus miles to dollars. 1.2¢/mile.',
    href: '/tools/united-miles-to-usd',
  },
  {
    name: 'Delta SkyMiles to USD',
    description: 'Convert Delta SkyMiles to dollars. 1.1¢/mile.',
    href: '/tools/delta-skymiles-to-usd',
  },
  {
    name: 'Southwest Rapid Rewards to USD',
    description: 'Convert Southwest points to dollars. 1.4¢/point.',
    href: '/tools/southwest-rapid-rewards-to-usd',
  },
  {
    name: 'Capital One Miles to USD',
    description: 'Convert Capital One miles to dollars. 1.0¢/mile.',
    href: '/tools/capital-one-miles-to-usd',
  },
  {
    name: 'Marriott Bonvoy Points to USD',
    description: 'Convert Marriott Bonvoy points to dollars. 0.7¢/point.',
    href: '/tools/marriott-bonvoy-points-to-usd',
  },
  {
    name: 'Hilton Honors Points to USD',
    description: 'Convert Hilton Honors points to dollars. 0.5¢/point.',
    href: '/tools/hilton-honors-points-to-usd',
  },
  {
    name: 'World of Hyatt Points to USD',
    description: 'Convert World of Hyatt points to dollars. 2.0¢/point.',
    href: '/tools/world-of-hyatt-points-to-usd',
  },
  {
    name: 'IHG One Rewards Points to USD',
    description: 'Convert IHG One Rewards points to dollars. 0.5¢/point.',
    href: '/tools/ihg-one-rewards-points-to-usd',
  },
  {
    name: 'Bilt Rewards Points to USD',
    description: 'Convert Bilt Rewards points to dollars. 1.5¢/point.',
    href: '/tools/bilt-rewards-points-to-usd',
  },
  {
    name: 'Citi ThankYou Points to USD',
    description: 'Convert Citi ThankYou points to dollars. 1.0¢/point.',
    href: '/tools/citi-thankyou-points-to-usd',
  },
];

export default function ToolsPage() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: 'Tools', url: 'https://creditodds.com/tools' },
      ]} />

      <nav className="bg-white border-b border-gray-200" aria-label="Breadcrumb">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ol className="flex items-center space-x-4 py-4">
            <li>
              <Link href="/" className="text-gray-400 hover:text-gray-500">Home</Link>
            </li>
            <li>
              <div className="flex items-center">
                <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
                </svg>
                <span className="ml-4 text-sm font-medium text-gray-500">Tools</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Tools</h1>
        <p className="mt-2 text-gray-600">Free calculators and converters for credit card rewards.</p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-center gap-4">
                {dollarIcon}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600">
                    {tool.name}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">{tool.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
