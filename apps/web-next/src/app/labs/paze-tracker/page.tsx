import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import { V2Footer } from '@/components/landing-v2/Chrome';
import PazeTrackerClient from './PazeTrackerClient';
import { PAZE_MERCHANTS } from './merchants';
import '../../landing.css';

export const metadata: Metadata = {
  title: 'Paze Tracker',
  description:
    'Every merchant that accepts Paze, plus how Paze actually works at each one: reload caps, timing rules, and current Paze offers.',
  openGraph: {
    title: 'Paze Tracker | CreditOdds',
    description:
      'Every merchant that accepts Paze, plus how Paze actually works at each one.',
    url: 'https://creditodds.com/labs/paze-tracker',
    type: 'website',
  },
  alternates: {
    canonical: 'https://creditodds.com/labs/paze-tracker',
  },
};

export default function PazeTrackerPage() {
  return (
    <div className="landing-v2 labs-v2">
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: 'Labs', url: 'https://creditodds.com/labs' },
          { name: 'Paze Tracker', url: 'https://creditodds.com/labs/paze-tracker' },
        ]}
      />

      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <Link href="/labs" className="cj-crumb">Labs</Link>
          <span className="cj-crumb-sep">/</span>
          <span className="cj-crumb cj-crumb-current" aria-current="page">Paze Tracker</span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span><span className="cj-status-dot" />{PAZE_MERCHANTS.length} merchants</span>
        </div>
      </div>

      <section className="page-hero wrap">
        {/* Brand mark above the title rather than inline: the hero title wraps
            to two lines on narrow screens, and a floated icon beside it broke
            that wrap awkwardly. */}
        <span className="labs-hero-logo">
          <Image src="/logos/paze.jpeg" alt="Paze" width={44} height={44} />
        </span>
        <h1 className="page-title">
          Paze Tracker. <em>Where it works.</em>
        </h1>
        <p className="page-sub">
          Paze publishes a list of merchants. It does not publish the part that
          matters: what you can actually do once you are there. This tracks both.
        </p>
      </section>

      <div className="wrap" style={{ paddingTop: 8, paddingBottom: 64 }}>
        <PazeTrackerClient />
      </div>

      <V2Footer />
    </div>
  );
}
