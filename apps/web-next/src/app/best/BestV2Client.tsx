'use client';

import Link from 'next/link';
import { V2Footer } from '@/components/landing-v2/Chrome';
import {
  TrophyIcon,
  GiftIcon,
  PaperAirplaneIcon,
  PercentBadgeIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  BanknotesIcon,
  GlobeAltIcon,
  SparklesIcon,
} from '@heroicons/react/24/solid';
import type { BestPage } from '@/lib/best';
import '../landing.css';

interface BestV2ClientProps {
  pages: BestPage[];
  totalRecords: number;
  totalCards: number;
}

const PAGE_ICONS: Record<
  string,
  React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
  'best-signup-bonuses': GiftIcon,
  'best-airline-cards': PaperAirplaneIcon,
  'best-0-apr-cards': PercentBadgeIcon,
  'best-dining-grocery-cards': ShoppingCartIcon,
  'best-secured-cards': ShieldCheckIcon,
  'best-cash-back-cards': BanknotesIcon,
  'best-travel-cards': GlobeAltIcon,
};

function formatShortDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function BestV2Client({
  pages,
  totalRecords,
  totalCards,
}: BestV2ClientProps) {
  const latestUpdate = pages
    .map((p) => p.updated_at || p.date)
    .sort()
    .reverse()[0];

  return (
    <div className="landing-v2">
      <section className="page-hero wrap">
        <div className="eyebrow">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent)',
            }}
          />
          <span>Best cards · ranked by data</span>
        </div>
        <h1 className="page-title">
          The best cards, ranked by <em>the data.</em>
        </h1>
        <p className="page-sub">
          Not paid placements. Not editorial vibes. Every ranking here is a function of
          real approval rate, record volume, fee, and rewards value.
        </p>
      </section>

      <div className="wrap">
        <div className="best-hero-stats">
          <div className="bhs">
            <div className="k">Records analyzed</div>
            <div className="v">{totalRecords.toLocaleString()}</div>
          </div>
          <div className="bhs">
            <div className="k">Cards ranked</div>
            <div className="v">{totalCards}</div>
          </div>
          <div className="bhs">
            <div className="k">Ranking pages</div>
            <div className="v">{pages.length}</div>
          </div>
          <div className="bhs">
            <div className="k">Last refresh</div>
            <div className="v">{formatShortDate(latestUpdate) || '—'}</div>
          </div>
        </div>

        {pages.length === 0 ? (
          <div
            style={{
              padding: '80px 0',
              textAlign: 'center',
              color: 'var(--muted)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
            }}
          >
            No rankings published yet.
          </div>
        ) : (
          <div className="best-grid">
            {pages.map((page, index) => {
              const Icon = PAGE_ICONS[page.slug] ?? SparklesIcon;
              return (
                <Link key={page.id} href={`/best/${page.slug}`} className="best-card">
                  <div className="best-cover">
                    <div className="best-cover-pattern" />
                    <div className="best-cover-num">
                      Series · {String(index + 1).padStart(2, '0')}
                    </div>
                    <Icon className="best-cover-icon" width={56} height={56} />
                  </div>
                  <div className="best-body">
                    <h2 className="best-title">{page.title}</h2>
                    <p className="best-desc">{page.description}</p>
                    <div className="best-meta">
                      <span>Updated · {formatShortDate(page.updated_at || page.date)}</span>
                      <span className="count">{page.cards.length} cards</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="best-method">
          <div>
            <div className="bm-kicker">Methodology</div>
            <h3>How rankings work</h3>
            <p>
              Each card is scored on approval rate, record volume confidence, annual
              cost, and rewards value — no affiliate tie-ins, no editorial vibes, just
              the numbers the community reports.
            </p>
          </div>
          <div>
            <div className="bm-kicker">No affiliate</div>
            <h3>No paid placements</h3>
            <p>
              We don&apos;t take money from issuers to move a card up a list. When you
              apply through a referral from a community member, the rewards go to them
              — not us.
            </p>
          </div>
          <div>
            <div className="bm-kicker">Freshness</div>
            <h3>Rebuilt with the data</h3>
            <p>
              Rankings are recomputed as new records land, so the top of the list
              reflects who&apos;s actually getting approved right now — not a snapshot
              from last year.
            </p>
          </div>
        </div>
      </div>
      <V2Footer />
    </div>
  );
}
