'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { V2Footer } from '@/components/landing-v2/Chrome';
import { FollowXCallout } from '@/components/landing-v2/FollowXCallout';
import CardImage from '@/components/ui/CardImage';
import { getNewsCards, type NewsItem, type NewsTag } from '@/lib/news';
import '../landing.css';

const NEWS_IMG_CDN = 'https://d3ay3etzd1512y.cloudfront.net/news_images';

/** Rows added per "Load more" press in the archive list. */
const PAGE_SIZE = 24;

interface NewsV2ClientProps {
  items: NewsItem[];
  /** All-time views keyed by news id. Rendered only above a floor, matching
   * the detail pages. */
  viewCounts: Record<string, number>;
}

type FilterKey = 'all' | NewsTag;

const TAG_FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new-card', label: 'New Card' },
  { key: 'bonus-change', label: 'Bonus' },
  { key: 'fee-change', label: 'Fees' },
  { key: 'benefit-change', label: 'Benefits' },
  { key: 'policy-change', label: 'Policy' },
  { key: 'limited-time', label: 'Limited' },
  { key: 'discontinued', label: 'Discontinued' },
  { key: 'rumor', label: 'Rumor' },
];

const TAG_DISPLAY: Record<NewsTag, string> = {
  'new-card': 'New card',
  'bonus-change': 'Bonus',
  'fee-change': 'Fees',
  'benefit-change': 'Benefits',
  'policy-change': 'Policy',
  'limited-time': 'Limited time',
  'discontinued': 'Discontinued',
  'rumor': 'Rumor',
  'general': 'News',
};

const TAG_KEYS = new Set<string>(TAG_FILTERS.map((t) => t.key));

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // timeZone: 'UTC' keeps SSR and client output identical — date-only strings
  // parse as UTC midnight, so local-zone formatting shifts the day for
  // visitors west of UTC and breaks hydration.
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function primaryTag(item: NewsItem): NewsTag {
  return item.tags?.[0] ?? 'general';
}

function readTimeFor(item: NewsItem): string {
  const text = item.body ?? item.summary ?? '';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 220))} min`;
}

/**
 * Summaries occasionally carry inline markdown from the generator (11 of 114 at
 * time of writing). List rows render plain text, so unwrap emphasis and links
 * rather than printing the asterisks.
 */
function plainSummary(text: string | undefined): string {
  return (text ?? '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1');
}

/**
 * Everything a search term may match on, lowercased once per item.
 *
 * Body text is included because the full article already travels in this page's
 * payload for the read-time estimate — searching it costs no extra bytes.
 */
function searchBlob(item: NewsItem): string {
  return [
    item.title,
    item.summary,
    item.body ?? '',
    item.bank ?? '',
    item.source ?? '',
    ...getNewsCards(item).map((c) => c.name),
    ...(item.tags ?? []).map((t) => TAG_DISPLAY[t] ?? t),
  ]
    .join(' ')
    .toLowerCase();
}

export default function NewsV2Client({ items, viewCounts }: NewsV2ClientProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [bank, setBank] = useState('all');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const viewsOf = (item: NewsItem) => viewCounts[item.id] ?? 0;

  // One-time sync from the URL after hydration so /news?bank=Chase and
  // /news?q=lounge are linkable from card and bank pages. Seeding this in the
  // useState initializer would mismatch SSR, which has no query string.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const b = params.get('bank');
    const t = params.get('tag');
    /* eslint-disable react-hooks/set-state-in-effect */
    if (q) setQuery(q);
    if (b) setBank(b);
    if (t && TAG_KEYS.has(t)) setFilter(t as FilterKey);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const blobs = useMemo(
    () => new Map(items.map((i) => [i.id, searchBlob(i)])),
    [items],
  );

  const banks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) {
      if (!i.bank) continue;
      counts.set(i.bank, (counts.get(i.bank) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [items]);

  const terms = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );

  // Search + issuer applied but not the tag, so the chip counts below can show
  // what each tag would yield rather than a frozen all-time number.
  const preTag = useMemo(
    () =>
      items.filter((i) => {
        if (bank !== 'all' && i.bank !== bank) return false;
        if (terms.length) {
          const blob = blobs.get(i.id) ?? '';
          if (!terms.every((t) => blob.includes(t))) return false;
        }
        return true;
      }),
    [items, bank, terms, blobs],
  );

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of preTag) {
      for (const t of i.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return counts;
  }, [preTag]);

  const filtered = useMemo(
    () =>
      filter === 'all'
        ? preTag
        : preTag.filter((i) => (i.tags ?? []).includes(filter)),
    [preTag, filter],
  );

  const isFiltering = terms.length > 0 || filter !== 'all' || bank !== 'all';

  function applyFilter(next: FilterKey) {
    setFilter(next);
    setVisible(PAGE_SIZE);
  }
  function applyQuery(next: string) {
    setQuery(next);
    setVisible(PAGE_SIZE);
  }
  function applyBank(next: string) {
    setBank(next);
    setVisible(PAGE_SIZE);
  }
  function clearFilters() {
    setQuery('');
    setBank('all');
    setFilter('all');
    setVisible(PAGE_SIZE);
  }

  // The editorial blocks always describe the newest stories; search and the tag
  // chips belong to the archive section below, so filters never reshuffle them.
  // Same source the covers below render from, so an item never gets promoted
  // into a featured slot it has no art for.
  const imaged = items.filter((i) => Boolean(i.news_image || getNewsCards(i)[0]?.image));
  const featured = imaged[0];
  const secondary = imaged.slice(1, 4);
  const usedIds = new Set(
    [featured?.id, ...secondary.map((s) => s.id)].filter(Boolean),
  );
  const topStories = items.filter((i) => !usedIds.has(i.id)).slice(0, 5);
  const newest = items[0];

  // Unfiltered, the archive really is every story — the handful repeated from
  // the blocks above cost less than a list that silently omits them.
  const shown = filtered.slice(0, visible);

  return (
    <div className="landing-v2">
      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <span className="cj-crumb cj-crumb-current" aria-current="page">News</span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span><span className="cj-status-dot" />{items.length.toLocaleString()} stor{items.length === 1 ? 'y' : 'ies'} · live</span>
        </div>
      </div>
      <section className="page-hero has-follow wrap">
        <div>
          <h1 className="page-title">
            News without the <em>affiliate spin.</em>
          </h1>
          <p className="page-sub">
            Card teardowns, issuer policy shifts, and data takes grounded in the records
            database. No referral-link chasing.
          </p>
        </div>
        <FollowXCallout sub="Don't miss an update" />
      </section>

      <div className="wrap">
        <Link href="/card-wire" className="news-wire-cta">
          <span className="news-wire-cta-dot" aria-hidden="true" />
          <span className="news-wire-cta-copy">
            <strong>Don&apos;t miss a sign-up bonus or card change.</strong> The
            Card Wire logs every fee, bonus, and application shift we track.
          </span>
          <span className="news-wire-cta-link">View the wire &rarr;</span>
        </Link>
        {featured ? (
          <div className="news-grid">
            <Link href={`/news/${featured.id}`} className="feat-article">
              <div className="feat-cover">
                {featured.news_image ? (
                  <Image
                    src={`${NEWS_IMG_CDN}/${featured.news_image}`}
                    alt={featured.title}
                    fill
                    sizes="(max-width: 900px) 100vw, 480px"
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <>
                    <div className="cover-pattern" />
                    <div className="cover-card">
                      <CardImage
                        cardImageLink={getNewsCards(featured)[0]?.image ?? undefined}
                        alt={getNewsCards(featured)[0]?.name || featured.title}
                        fill
                        sizes="240px"
                        style={{ objectFit: 'cover' }}
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="feat-body">
                <div className="feat-meta">
                  <span className="news-tag">{TAG_DISPLAY[primaryTag(featured)]}</span>
                  <span>{formatDate(featured.date)}</span>
                  <span>·</span>
                  <span>{readTimeFor(featured)} read</span>
                  {viewsOf(featured) > 100 && (
                    <>
                      <span>·</span>
                      <span>{viewsOf(featured).toLocaleString('en-US')} views</span>
                    </>
                  )}
                </div>
                <h2 className="feat-title">{featured.title}</h2>
                <p className="feat-excerpt">{plainSummary(featured.summary)}</p>
              </div>
            </Link>

            <div className="news-side">
              <div className="news-side-label">Latest stories</div>
              {topStories.map((item) => (
                <Link key={item.id} href={`/news/${item.id}`} className="news-item">
                  <div className="ni-meta">
                    <span className="news-tag">{TAG_DISPLAY[primaryTag(item)]}</span>
                    <span>{formatDateShort(item.date)}</span>
                    {/* ni-meta is inline (not a flex row), so the separator must be
                        literal text; a bare span would render flush against the date. */}
                    {viewsOf(item) > 100 && <> · {viewsOf(item).toLocaleString('en-US')} views</>}
                  </div>
                  <h3 className="ni-title">{item.title}</h3>
                  <p className="ni-excerpt">{plainSummary(item.summary)}</p>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="news-side" style={{ paddingTop: 20 }}>
            <div className="news-side-label">Recent stories</div>
            {topStories.map((item) => (
              <Link key={item.id} href={`/news/${item.id}`} className="news-item">
                <div className="ni-meta">
                  <span className="news-tag">{TAG_DISPLAY[primaryTag(item)]}</span>
                  <span>{formatDateShort(item.date)}</span>
                  {viewsOf(item) > 100 && <> · {viewsOf(item).toLocaleString('en-US')} views</>}
                </div>
                <h3 className="ni-title">{item.title}</h3>
                <p className="ni-excerpt">{plainSummary(item.summary)}</p>
              </Link>
            ))}
          </div>
        )}

        {secondary.length > 0 && (
          <div className="news-secondary">
            {secondary.map((item) => (
              <Link key={item.id} href={`/news/${item.id}`} className="news-card">
                <div className="nc-cover">
                  {item.news_image ? (
                    <Image
                      src={`${NEWS_IMG_CDN}/${item.news_image}`}
                      alt={item.title}
                      fill
                      sizes="(max-width: 640px) 100vw, 320px"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <>
                      <div className="nc-pattern" />
                      <div className="nc-card-thumb">
                        <CardImage
                          cardImageLink={getNewsCards(item)[0]?.image ?? undefined}
                          alt={getNewsCards(item)[0]?.name || item.title}
                          fill
                          sizes="160px"
                          style={{ objectFit: 'cover' }}
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className="nc-body">
                  <div className="nc-meta">
                    {TAG_DISPLAY[primaryTag(item)]} · {formatDateShort(item.date)}
                    {viewsOf(item) > 100 && <> · {viewsOf(item).toLocaleString('en-US')} views</>}
                  </div>
                  <h3 className="nc-title">{item.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        )}

        <section className="news-archive" aria-label="News archive">
          <div className="news-archive-head">
            <h2 className="news-archive-title">
              {isFiltering ? 'Results' : 'Every story, newest first'}
            </h2>
            <span className="news-archive-count">
              {filtered.length === 0
                ? 'Nothing to show'
                : `Showing ${shown.length} of ${filtered.length}${isFiltering ? ' matches' : ''}`}
            </span>
          </div>

          <div className="filter-bar news-archive-filters">
            <div className="search-row">
              <div className="search-wrap">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="search"
                  placeholder="Search all news by card, issuer, or keyword…"
                  value={query}
                  onChange={(e) => applyQuery(e.target.value)}
                  aria-label="Search news"
                />
              </div>
              <select
                className="news-bank-select"
                value={bank}
                onChange={(e) => applyBank(e.target.value)}
                aria-label="Filter news by issuer"
              >
                <option value="all">All issuers</option>
                {banks.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({b.count})
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-chip-row">
              {TAG_FILTERS.map((t) => {
                const count = t.key === 'all' ? preTag.length : tagCounts.get(t.key) ?? 0;
                return (
                  <button
                    key={t.key}
                    type="button"
                    className={'filter-chip ' + (filter === t.key ? 'active' : '')}
                    onClick={() => applyFilter(t.key)}
                    disabled={count === 0 && filter !== t.key}
                  >
                    {t.label}
                    <span className="ct">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="filter-spacer" />
            <span className="filter-summary">
              {isFiltering ? (
                <button type="button" className="news-clear-btn" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : newest ? (
                `Updated ${formatDate(newest.date)}`
              ) : null}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="news-archive-empty">
              <p>No stories match this search.</p>
              <button type="button" className="news-clear-btn" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div className="news-archive-list">
                {shown.map((item) => (
                  <Link key={item.id} href={`/news/${item.id}`} className="news-item">
                    <div className="ni-meta">
                      <span className="news-tag">{TAG_DISPLAY[primaryTag(item)]}</span>
                      <span>{formatDate(item.date)}</span>
                      {item.bank ? <> · {item.bank}</> : null}
                      {viewsOf(item) > 100 && <> · {viewsOf(item).toLocaleString('en-US')} views</>}
                    </div>
                    <h3 className="ni-title">{item.title}</h3>
                    <p className="ni-excerpt">{plainSummary(item.summary)}</p>
                  </Link>
                ))}
              </div>

              {shown.length < filtered.length && (
                <div className="news-archive-more">
                  <button
                    type="button"
                    className="news-load-more"
                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  >
                    Load {Math.min(PAGE_SIZE, filtered.length - shown.length)} more
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <V2Footer />
    </div>
  );
}
