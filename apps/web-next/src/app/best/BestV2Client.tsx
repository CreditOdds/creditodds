'use client';

import Link from 'next/link';
import { V2Footer } from '@/components/landing-v2/Chrome';
import CardImage from '@/components/ui/CardImage';
import type { BestPage } from '@/lib/best';
import '../landing.css';

interface BestV2ClientProps {
  pages: BestPage[];
  previews: Record<string, { src?: string; alt: string }[]>;
  totalIssuers: number;
  totalCards: number;
}

function formatShortDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // timeZone: 'UTC' keeps SSR and client output identical — local-zone
  // formatting shifts the day for visitors west of UTC and breaks hydration.
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default function BestV2Client({
  pages,
  previews,
  totalIssuers,
  totalCards,
}: BestV2ClientProps) {
  const latestUpdate = pages
    .map((p) => p.updated_at || p.date)
    .sort()
    .reverse()[0];

  return (
    <div className="landing-v2">
      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <span className="cj-crumb cj-crumb-current" aria-current="page">Best Cards</span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span><span className="cj-status-dot" />{totalCards.toLocaleString()} cards · live</span>
        </div>
      </div>
      <section className="page-hero wrap">
        <h1 className="page-title">
          The best cards, ranked by <em>the data.</em>
        </h1>
        <p className="page-sub">
          Not paid placements. Not editorial vibes. Every ranking here is a function of
          real approval rate, record volume, fee, and rewards value.
        </p>
      </section>

      <div className="wrap">
        <div className="best-promos">
          <Link href="/best-card-for" className="best-promo">
            <span className="bp-kicker">By store</span>
            <h3 className="bp-title">Best card for every store</h3>
            <p className="bp-desc">
              See the top card to use at every major U.S. retailer we track, from
              Amazon and Costco to Whole Foods.
            </p>
            <span className="bp-cta">
              Browse by store <span aria-hidden>→</span>
            </span>
          </Link>
          <Link href="/best-card-for-me" className="best-promo">
            <span className="bp-kicker">For you</span>
            <h3 className="bp-title">Best card for me</h3>
            <p className="bp-desc">
              Answer a few questions about your wallet and spending, and get a
              ranked shortlist of the cards to get next.
            </p>
            <span className="bp-cta">
              Find my next card <span aria-hidden>→</span>
            </span>
          </Link>
        </div>

        <div className="best-hero-stats">
          <div className="bhs">
            <div className="k">Issuers covered</div>
            <div className="v">{totalIssuers}</div>
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
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 13,
            }}
          >
            No rankings published yet.
          </div>
        ) : (
          <div className="best-grid">
            {pages.map((page) => {
              return (
                <Link key={page.id} href={`/best/${page.slug}`} className="best-card">
                  <div className="best-body">
                    <h2 className="best-title">{page.title}</h2>
                    <p className="best-desc">{page.description}</p>
                    {(previews[page.slug]?.length ?? 0) > 0 && (
                      <div className="best-preview">
                        <div className="best-preview-stack">
                          {previews[page.slug].map((img, i) => (
                            <div className="bf-mini" key={i}>
                              <CardImage
                                cardImageLink={img.src}
                                alt={img.alt}
                                fill
                                sizes="64px"
                                style={{ objectFit: 'cover', borderRadius: 4 }}
                              />
                              {i === 0 && (
                                <span className="bf-crown" aria-hidden="true">
                                  <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M4 18h16l1-9-5 3.5L12 6l-4 6.5L3 9z" />
                                  </svg>
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        <span className="best-preview-label">Top picks</span>
                      </div>
                    )}
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
