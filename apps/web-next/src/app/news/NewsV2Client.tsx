'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { V2Footer } from '@/components/landing-v2/Chrome';
import CardImage from '@/components/ui/CardImage';
import type { NewsItem, NewsTag } from '@/lib/news';
import '../landing.css';

interface NewsV2ClientProps {
  items: NewsItem[];
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
];

const TAG_DISPLAY: Record<NewsTag, string> = {
  'new-card': 'New card',
  'bonus-change': 'Bonus',
  'fee-change': 'Fees',
  'benefit-change': 'Benefits',
  'policy-change': 'Policy',
  'limited-time': 'Limited time',
  'discontinued': 'Discontinued',
  'general': 'News',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function primaryTag(item: NewsItem): NewsTag {
  return item.tags?.[0] ?? 'general';
}

function readTimeFor(item: NewsItem): string {
  const text = item.body ?? item.summary ?? '';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 220))} min`;
}

export default function NewsV2Client({ items }: NewsV2ClientProps) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((i) => (i.tags ?? []).includes(filter));
  }, [filter, items]);

  const [featured, ...rest] = filtered;
  const topStories = rest.slice(0, 5);
  const secondary = rest.slice(5, 8);

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
          <span>Card news · updated daily</span>
        </div>
        <h1 className="page-title">
          News without the <em>affiliate spin.</em>
        </h1>
        <p className="page-sub">
          Card teardowns, issuer policy shifts, and data takes grounded in the records
          database. No referral-link chasing.
        </p>
      </section>

      <div className="wrap">
        <div className="filter-bar" style={{ paddingTop: 20 }}>
          <div className="filter-chip-row">
            {TAG_FILTERS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={'filter-chip ' + (filter === t.key ? 'active' : '')}
                onClick={() => setFilter(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="filter-spacer" />
          <span className="filter-summary">
            {filtered.length} article{filtered.length === 1 ? '' : 's'}
            {featured ? ` · ${formatDate(featured.date)}` : ''}
          </span>
        </div>

        {featured ? (
          <div className="news-grid">
            <Link href={`/news/${featured.id}`} className="feat-article">
              <div className="feat-cover">
                <div className="cover-pattern" />
                <div className="cover-card">
                  {featured.card_image_link ? (
                    <CardImage
                      cardImageLink={featured.card_image_link}
                      alt=""
                      fill
                      sizes="240px"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : null}
                </div>
              </div>
              <div className="feat-body">
                <div className="feat-meta">
                  <span className="news-tag">{TAG_DISPLAY[primaryTag(featured)]}</span>
                  <span>{formatDate(featured.date)}</span>
                  <span>·</span>
                  <span>{readTimeFor(featured)} read</span>
                </div>
                <h2 className="feat-title">{featured.title}</h2>
                <p className="feat-excerpt">{featured.summary}</p>
              </div>
            </Link>

            <div className="news-side">
              <div className="news-side-label">Top stories this week</div>
              {topStories.map((item) => (
                <Link key={item.id} href={`/news/${item.id}`} className="news-item">
                  <div className="ni-meta">
                    <span className="news-tag">{TAG_DISPLAY[primaryTag(item)]}</span>
                    <span>{formatDateShort(item.date)}</span>
                  </div>
                  <h3 className="ni-title">{item.title}</h3>
                  <p className="ni-excerpt">{item.summary}</p>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '60px 0' }}>
            No articles match this filter.
          </div>
        )}

        {secondary.length > 0 && (
          <div className="news-secondary">
            {secondary.map((item) => (
              <Link key={item.id} href={`/news/${item.id}`} className="news-card">
                <div className="nc-cover">
                  <div className="nc-pattern" />
                  <div className="nc-card-thumb">
                    {item.card_image_link ? (
                      <CardImage
                        cardImageLink={item.card_image_link}
                        alt=""
                        fill
                        sizes="160px"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="nc-body">
                  <div className="nc-meta">
                    {TAG_DISPLAY[primaryTag(item)]} · {formatDateShort(item.date)}
                  </div>
                  <h3 className="nc-title">{item.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <V2Footer />
    </div>
  );
}
