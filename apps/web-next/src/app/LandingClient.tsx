'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import CardImage from '@/components/ui/CardImage';

const NEWS_IMG_CDN = 'https://d3ay3etzd1512y.cloudfront.net/news_images';
import { categoryLabels, pickHeadlineReward } from '@/lib/cardDisplayUtils';
import { cardMatchesSearch, expandSearchTerm } from '@/lib/searchAliases';
import type { EditorialViewCounts } from '@/lib/api';
import { V2Footer } from '@/components/landing-v2/Chrome';
import CardRainCanvas from './CardRainCanvas';
import './landing.css';
import './landing-v3.css';

// Slim shapes — only the fields the landing page actually reads.
// Defined here so the server can project the dataset down before serializing.
export type LandingReward = { category: string; value: number; unit: string };
export type LandingSignupBonus = {
  value?: number;
  type?: string;
  spend_requirement?: number;
  timeframe_months?: number;
};
export type LandingCard = {
  slug: string;
  card_name: string;
  bank: string;
  db_card_id?: number;
  card_image_link?: string;
  accepting_applications: boolean;
  approved_count?: number;
  rejected_count?: number;
  annual_fee?: number;
  signup_bonus?: LandingSignupBonus;
  rewards?: LandingReward[];
};
export type LandingArticle = {
  slug: string;
  title: string;
  date: string;
  tag?: string;
  summary: string;
  cardImages: { src?: string; alt: string }[];
};
export type LandingNewsItem = {
  id: string;
  title: string;
  date: string;
  summary: string;
  cardImages: { src?: string; alt: string }[];
  newsImage?: string;
};
export type LandingBestPage = {
  slug: string;
  title: string;
  cardCount: number;
  cardImages: { src?: string; alt: string }[];
};

interface LandingClientProps {
  initialCards: LandingCard[];
  news: LandingNewsItem[];
  articles: LandingArticle[];
  bestPages: LandingBestPage[];
  trendingViews: Record<number, number>;
  editorialViews: EditorialViewCounts;
}

const TOOL_LINKS: { name: string; value: string; href: string; logo: string }[] = [
  { name: 'Chase UR', value: '1 ≈ 1.25¢', href: '/tools/chase-ultimate-rewards-to-usd', logo: '/logos/chase.jpg' },
  { name: 'Amex MR', value: '1 ≈ 1.2¢', href: '/tools/amex-membership-rewards-to-usd', logo: '/logos/amex.jpg' },
  { name: 'Cap One miles', value: '1 ≈ 1.0¢', href: '/tools/capital-one-miles-to-usd', logo: '/logos/capital-one.jpg' },
  { name: 'Bilt points', value: '1 ≈ 1.5¢', href: '/tools/bilt-rewards-points-to-usd', logo: '/logos/bilt.jpg' },
  { name: 'Hyatt points', value: '1 ≈ 2.0¢', href: '/tools/world-of-hyatt-points-to-usd', logo: '/logos/hyatt.jpg' },
  { name: 'Delta SkyMiles', value: '1 ≈ 1.1¢', href: '/tools/delta-skymiles-to-usd', logo: '/logos/delta.jpg' },
  { name: 'United miles', value: '1 ≈ 1.2¢', href: '/tools/united-miles-to-usd', logo: '/logos/united.jpg' },
  { name: 'Marriott', value: '1 ≈ 0.7¢', href: '/tools/marriott-bonvoy-points-to-usd', logo: '/logos/marriott.jpg' },
];

const WALLET_SLUGS = ['chase-sapphire-reserve', 'the-platinum-card', 'wells-fargo-active-cash'];
const WALLET_RENEWALS = ['Renews Jan 27', 'Renews Mar 27', 'Renews in 11d'];

// Rotating "best card here" scenarios that light up the wallet rows in turn.
// Each scenario maps to one of the WALLET_SLUGS above and mirrors what the real
// /wallet-picks/nearby ranker would return for that place (rates from card YAML).
const WALLET_SCENARIOS: { slug: string; place: string; badge: string }[] = [
  { slug: 'chase-sapphire-reserve', place: 'Blue Bottle Coffee', badge: 'Best · 3x' },
  { slug: 'the-platinum-card', place: 'United counter · SFO', badge: 'Best · 5x' },
  { slug: 'wells-fargo-active-cash', place: "Trader Joe's", badge: 'Best · 2%' },
];
const WALLET_ROTATE_MS = 5500;

const POPULAR_FALLBACK = [
  'chase-sapphire-preferred',
  'american-express-gold-card',
  'capital-one-venture-x',
  'chase-sapphire-reserve',
  'the-platinum-card',
  'bilt-mastercard',
  'citi-double-cash',
  'citi-custom-cash',
];

function shortName(card: LandingCard): string {
  return card.card_name
    .replace(/^The\s+/i, '')
    .replace(/\s+from American Express$/i, '')
    .replace(/\s+Credit Card$/i, '');
}

function totalRecords(card: LandingCard): number {
  return (card.approved_count ?? 0) + (card.rejected_count ?? 0);
}

function bonusLabel(card: LandingCard): string {
  const sb = card.signup_bonus;
  if (!sb || !sb.value) return 'No SUB';
  const v = sb.value;
  const formatted = v >= 1000 ? `${Math.round(v / 1000)}K` : `${v}`;
  if (sb.type === 'cashback' || sb.type === 'usd' || sb.type === 'cash') {
    return `$${formatted}`;
  }
  if (sb.type === 'miles') return `${formatted} mi`;
  return `${formatted} pts`;
}

function topReward(card: LandingCard): { rate: string; label: string } | null {
  // Use the shared headline-picker so portal rates never crowd out everyday
  // categories. When the headline IS portal-only, keep the "(via Portal)"
  // suffix in the label so the catch is visible — see pickHeadlineReward.
  const pick = pickHeadlineReward(card.rewards as LandingReward[] | undefined);
  if (!pick) return null;
  const { reward } = pick;
  const rate = reward.unit === 'percent' ? `${reward.value}%` : `${reward.value}x`;
  const rawLabel = categoryLabels[reward.category] || reward.category.replace(/_/g, ' ');
  return { rate, label: rawLabel.toLowerCase() };
}

function searchRelevance(card: LandingCard, query: string): number {
  const terms = expandSearchTerm(query.trim());
  const name = card.card_name.toLowerCase();
  const bank = card.bank.toLowerCase();
  const records = totalRecords(card);
  let best = 0;
  for (const t of terms) {
    if (!t) continue;
    let s = 0;
    if (name.startsWith(t)) s = 1000;
    else if (name.includes(' ' + t)) s = 600;
    else if (name.includes(t)) s = 300;
    if (bank.startsWith(t)) s = Math.max(s, 200);
    else if (bank.includes(t)) s = Math.max(s, 80);
    if (s > best) best = s;
  }
  // Popularity tiebreak — capped so it can't outweigh a name-prefix match.
  return best + Math.min(records, 50);
}

function spendReqShort(card: LandingCard): string | null {
  const sb = card.signup_bonus;
  if (!sb || !sb.spend_requirement || !sb.timeframe_months) return null;
  const v = sb.spend_requirement;
  const formatted = v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`;
  return `${formatted} in ${sb.timeframe_months}mo`;
}

function feeLabel(card: LandingCard): string {
  return card.annual_fee ? `$${card.annual_fee}/yr` : 'No annual fee';
}

function shortenBestTitle(title: string): string {
  return title
    .replace(/^Best\s+/i, '')
    .replace(/^Credit\s+Cards?\s+(for\s+)?/i, '')
    .replace(/^Cards?\s+for\s+/i, '')
    .replace(/\s+Credit\s+Cards?$/i, '')
    .replace(/^for\s+/i, '')
    .replace(/\s+and\s+/gi, ' & ')
    .trim();
}

function formatNewsDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function Hero({ cards }: { cards: LandingCard[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // Index of the keyboard-highlighted result; -1 means none highlighted.
  const [active, setActive] = useState(-1);

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return cards
      .filter((c) => c.accepting_applications)
      .filter((c) => cardMatchesSearch(c.card_name, c.bank, q))
      .map((c) => ({ c, s: searchRelevance(c, q) }))
      .sort((a, b) => b.s - a.s || a.c.card_name.localeCompare(b.c.card_name))
      .slice(0, 6)
      .map(({ c }) => c);
  }, [query, cards]);

  function go(slug: string) {
    router.push(`/card/${slug}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!matches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <section className="hero-c hero--matrix">
      <CardRainCanvas />
      <div className="wrap">
        <div className="top">
          <h1>
            Type a card. <em>See the file.</em>
          </h1>
          <p className="sub">
            CreditOdds opens up every card in the U.S. — benefits, fees, news, real approval
            records, alternatives. Start typing and see what we have.
          </p>
        </div>

        <div className="search-wrap">
          <div className="search-bar">
            <form
              className="search-c"
              onSubmit={(e) => {
                e.preventDefault();
                const pick = matches[active] ?? matches[0];
                if (pick) go(pick.slug);
              }}
            >
              <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                value={query}
                placeholder="Search any card by name…"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  setActive(-1);
                }}
                onKeyDown={onKeyDown}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                aria-label="Search any card"
                role="combobox"
                aria-expanded={open && !!query.trim()}
                aria-controls="hero-search-results"
                aria-activedescendant={active >= 0 ? `hero-opt-${active}` : undefined}
              />
              <span className="kbd">Enter ↵</span>
            </form>

            {open && query.trim() && (
              <div className="search-results" role="listbox" id="hero-search-results">
                {matches.length === 0 ? (
                  <div className="opt-empty">No cards match &ldquo;{query}&rdquo;.</div>
                ) : (
                  matches.map((c, idx) => (
                    <Link
                      key={c.slug}
                      id={`hero-opt-${idx}`}
                      href={`/card/${c.slug}`}
                      role="option"
                      aria-selected={idx === active}
                      className={`opt${idx === active ? ' is-active' : ''}`}
                      onMouseEnter={() => setActive(idx)}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <div className="opt-thumb">
                        <CardImage cardImageLink={c.card_image_link} alt={c.card_name} fill sizes="44px" style={{ objectFit: 'cover' }} />
                      </div>
                      <div>
                        <div className="opt-name">{c.card_name}</div>
                        <div className="opt-iss">{c.bank}</div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>

          <Link href="/explore" className="explore-all">
            Or explore all cards →
          </Link>
        </div>
      </div>
    </section>
  );
}

function PopularLane({
  cards,
  trendingViews,
}: {
  cards: LandingCard[];
  trendingViews: Record<number, number>;
}) {
  const popular = useMemo(() => {
    const active = cards.filter((c) => c.accepting_applications);
    // Primary ranking: most-viewed in the last 30 days, matching the Explore
    // page's "trending" sort (keyed by numeric db_card_id, tiebroken by records).
    const viewsOf = (c: LandingCard) =>
      c.db_card_id != null ? (trendingViews[c.db_card_id] ?? 0) : 0;
    const hasViews = active.some((c) => viewsOf(c) > 0);
    if (hasViews) {
      return [...active]
        .sort((a, b) => {
          const dv = viewsOf(b) - viewsOf(a);
          if (dv !== 0) return dv;
          return totalRecords(b) - totalRecords(a);
        })
        .slice(0, 8);
    }
    // Fallback when view data is unavailable (endpoint failed/empty): record count.
    const hasRecords = active.some((c) => totalRecords(c) > 0);
    if (hasRecords) {
      return [...active].sort((a, b) => totalRecords(b) - totalRecords(a)).slice(0, 8);
    }
    // Final fallback for envs without any stats (local dev): curated set + first cards.
    const bySlug = new Map(active.map((c) => [c.slug, c]));
    const curated = POPULAR_FALLBACK.map((s) => bySlug.get(s)).filter((c): c is LandingCard => !!c);
    const seen = new Set(curated.map((c) => c.slug));
    const rest = active.filter((c) => !seen.has(c.slug));
    return [...curated, ...rest].slice(0, 8);
  }, [cards, trendingViews]);

  return (
    <div className="lane">
      <div className="lane-hd">
        <div>
          <div className="num">— Lane 01 / Cards</div>
          <h3>
            Popular this <em>week</em>
          </h3>
        </div>
        <Link href="/explore" className="more">
          See all {cards.length} →
        </Link>
      </div>
      <div className="lane-track">
        {popular.map((c) => {
          const reward = topReward(c);
          const spend = spendReqShort(c);
          return (
            <Link className="lc" key={c.slug} href={`/card/${c.slug}`}>
              <div className="lc-top">
                <div className="lc-thumb">
                  <CardImage cardImageLink={c.card_image_link} alt={c.card_name} fill sizes="56px" style={{ objectFit: 'cover' }} />
                </div>
                <div>
                  <div className="lc-nm">{shortName(c)}</div>
                  <div className="lc-iss">
                    {c.bank} · {feeLabel(c)}
                  </div>
                </div>
              </div>
              <div className="lc-stat">
                <div className="lc-cell">
                  <div className="k">Bonus</div>
                  <div className="v">{bonusLabel(c)}</div>
                  {spend && <div className="sub">{spend}</div>}
                </div>
                <div className="lc-cell right">
                  <div className="k">Top reward</div>
                  {reward ? (
                    <>
                      <div className="v acc">{reward.rate}</div>
                      <div className="sub">{reward.label}</div>
                    </>
                  ) : (
                    <div className="v">—</div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function BestForLane({ bestPages }: { bestPages: LandingBestPage[] }) {
  if (bestPages.length === 0) return null;

  return (
    <div className="lane">
      <div className="lane-hd">
        <div>
          <div className="num">— Lane 02 / Best for</div>
          <h3>
            Editorial <em>rankings</em>
          </h3>
        </div>
        <Link href="/best" className="more">
          All {bestPages.length} categories →
        </Link>
      </div>
      <div className="lane-track">
        {bestPages.map((page) => (
          <Link key={page.slug} href={`/best/${page.slug}`} className="lnk">
            <div className="cat">Best for</div>
            <h4>{shortenBestTitle(page.title)}</h4>
            <div className="bf-stack">
              {page.cardImages.map((img, i) => (
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
            <div className="bf-cta">{page.cardCount} cards ranked →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

type EditorialItem = {
  href: string;
  tag: string;
  date: string;
  title: string;
  summary: string;
  cardImages: { src?: string; alt: string }[];
  /** Full-bleed hero image (news AI scene). Preferred over the fanned cardImages. */
  image?: string;
  ts: number;
  views: number;
};

function NewsLane({
  news,
  articles,
  editorialViews,
}: {
  news: LandingNewsItem[];
  articles: LandingArticle[];
  editorialViews: EditorialViewCounts;
}) {
  const items = useMemo<EditorialItem[]>(() => {
    const toTs = (d: string) => {
      const t = new Date(d).getTime();
      return isNaN(t) ? 0 : t;
    };
    const fromArticles: EditorialItem[] = articles.map((a) => ({
      href: `/articles/${a.slug}`,
      tag: a.tag || 'Article',
      date: formatNewsDate(a.date),
      title: a.title,
      summary: a.summary,
      cardImages: a.cardImages,
      ts: toTs(a.date),
      views: editorialViews.article[a.slug] ?? 0,
    }));
    const fromNews: EditorialItem[] = news.map((n) => ({
      href: `/news/${n.id}`,
      tag: 'News',
      date: formatNewsDate(n.date),
      title: n.title,
      summary: n.summary,
      cardImages: n.cardImages,
      image: n.newsImage ? `${NEWS_IMG_CDN}/${n.newsImage}` : undefined,
      ts: toTs(n.date),
      views: editorialViews.news[n.id] ?? 0,
    }));
    // Rank by most-viewed this week; tiebreak (and cold-start fallback when
    // there's no view data yet) by newest first. lead = items[0], digest = rest.
    return [...fromArticles, ...fromNews]
      .sort((a, b) => b.views - a.views || b.ts - a.ts)
      .slice(0, 5);
  }, [news, articles, editorialViews]);

  if (items.length === 0) return null;

  const [lead, ...digest] = items;
  const leadImages = lead.cardImages.filter((img) => !!img.src);
  const hasLeadArt = leadImages.length > 0;

  return (
    <div className="lane">
      <div className="lane-hd">
        <div>
          <div className="num">— Lane 03 / Editorial</div>
          <h3>
            Reporting &amp; <em>news</em>
          </h3>
        </div>
        <Link href="/news" className="more">
          All news →
        </Link>
      </div>
      <div className="ed-grid">
        <Link href={lead.href} className="ed-lead">
          <div className="ed-cv">
            {lead.image ? (
              <Image
                src={lead.image}
                alt={lead.title}
                fill
                sizes="(max-width: 900px) 100vw, 520px"
                style={{ objectFit: 'cover' }}
              />
            ) : hasLeadArt ? (
              <div className="stack">
                {leadImages.slice(0, 3).map((img, j, arr) => {
                  const center = (arr.length - 1) / 2;
                  const offset = j - center;
                  return (
                    <div
                      key={j}
                      className="stack-item"
                      style={{
                        transform: `rotate(${offset * 8}deg) translateY(${
                          arr.length > 1 && j === Math.round(center) ? -10 : 0
                        }px)`,
                      }}
                    >
                      <CardImage
                        cardImageLink={img.src}
                        alt={img.alt || lead.title}
                        fill
                        sizes="120px"
                        style={{ objectFit: 'cover' }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ed-plate">
                <span className="ed-plate-kicker">— CreditOdds</span>
                <span className="ed-plate-cat">{lead.tag}</span>
              </div>
            )}
          </div>
          <div className="ed-lead-bd">
            <div className="meta">
              <span className={`tag${lead.tag === 'News' ? ' is-news' : ''}`}>
                {lead.tag}
              </span>
              <span>{lead.date}</span>
            </div>
            <h4>{lead.title}</h4>
            {lead.summary && <p className="dek">{lead.summary}</p>}
          </div>
        </Link>
        <div className="ed-digest">
          {digest.map((it, i) => (
            <Link key={it.href + i} href={it.href} className="ed-row">
              <div className="meta">
                <span className={`tag${it.tag === 'News' ? ' is-news' : ''}`}>
                  {it.tag}
                </span>
                <span>{it.date}</span>
              </div>
              <h5>{it.title}</h5>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function FooterBlocks({ cards }: { cards: LandingCard[] }) {
  const walletCards = useMemo(() => {
    return WALLET_SLUGS
      .map((s) => cards.find((c) => c.slug === s))
      .filter((c): c is LandingCard => !!c);
  }, [cards]);

  const totalFee = walletCards.reduce((sum, c) => sum + (c.annual_fee ?? 0), 0);

  // Only rotate through scenarios whose card is actually present in the wallet.
  const scenarios = useMemo(
    () => WALLET_SCENARIOS.filter((s) => walletCards.some((c) => c.slug === s.slug)),
    [walletCards],
  );
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (scenarios.length < 2) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const id = setInterval(() => {
      setActiveIdx((i) => (i + 1) % scenarios.length);
    }, WALLET_ROTATE_MS);
    return () => clearInterval(id);
  }, [scenarios.length]);

  const active = scenarios[activeIdx % scenarios.length] ?? null;

  return (
    <section className="footer-blocks">
      <div className="wrap">
        <div className="fb-grid">
          <div className="fb">
            <div className="sec-num">— Wallet</div>
            <h3>
              Track <em>your</em> cards.
            </h3>
            <p>
              Build a wallet, track renewals, get personalized news. Submit application
              records that earn you referral attribution and feed our approval model.
            </p>
            <div className="wallet-mini">
              <div className="wm-hd">
                <span>{walletCards.length} cards</span>
                <span>${totalFee.toLocaleString()}/yr in fees</span>
              </div>
              {active && (
                <div className="wm-context" aria-live="polite">
                  <span className="wm-ctx-place" key={active.place}>
                    <span className="wm-ctx-pin" aria-hidden>📍</span>
                    Near you: {active.place}
                  </span>
                  <span className="wm-ctx-hint">best card ↓</span>
                </div>
              )}
              {walletCards.map((c, i) => {
                const isActive = active?.slug === c.slug;
                return (
                  <div
                    className={`wm-row${active ? (isActive ? ' active' : ' dim') : ''}`}
                    key={c.slug}
                  >
                    <div className="wm-thumb">
                      <CardImage cardImageLink={c.card_image_link} alt={c.card_name} fill sizes="50px" style={{ objectFit: 'cover' }} />
                    </div>
                    <div>
                      <div className="nm">{shortName(c)}</div>
                      <div className="iss">{c.bank}</div>
                    </div>
                    <div className="v">
                      ${c.annual_fee ?? 0}
                      {isActive ? (
                        <span className="sub wm-best">{active.badge}</span>
                      ) : (
                        <span className="sub">{WALLET_RENEWALS[i]}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="fb">
            <div className="sec-num">— Tools</div>
            <h3>
              Free <em>calculators</em>.
            </h3>
            <p>
              Everything you need to do credit-card math without a spreadsheet. Approval
              probability is calibrated against thousands of real records.
            </p>
            <div className="tool-mini-grid">
              <Link href="/check-odds" className="tmini odds">
                <div className="odds-left">
                  <svg className="odds-dice" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 3 L20 7.5 L12 12 L4 7.5 Z" fill="rgba(255,255,255,0.45)" />
                    <path d="M12 12 L20 7.5 V16.5 L12 21 Z" fill="rgba(255,255,255,0.22)" />
                    <path d="M4 7.5 L12 12 V21 L4 16.5 Z" fill="rgba(255,255,255,0.08)" />
                    <path
                      d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 Z"
                      stroke="#fff"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M4 7.5 L12 12 L20 7.5 M12 12 V21"
                      stroke="#fff"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <ellipse cx="12" cy="7.5" rx="1.7" ry="1.05" fill="#fff" />
                    <ellipse cx="6.3" cy="12.4" rx="0.95" ry="1.15" fill="#fff" />
                    <ellipse cx="9.7" cy="16.4" rx="0.95" ry="1.15" fill="#fff" />
                    <ellipse cx="14.3" cy="12.6" rx="0.95" ry="1.15" fill="#fff" />
                    <ellipse cx="16" cy="14.3" rx="0.95" ry="1.15" fill="#fff" />
                    <ellipse cx="17.7" cy="16" rx="0.95" ry="1.15" fill="#fff" />
                  </svg>
                  <div>
                    <div className="nm">Approval odds</div>
                    <div className="v">Real probability · live data</div>
                  </div>
                </div>
                <span style={{ fontSize: 18 }}>→</span>
              </Link>
              {TOOL_LINKS.map((t) => (
                <Link key={t.href} href={t.href} className="tmini">
                  <Image src={t.logo} alt={`${t.name} logo`} width={16} height={16} className="tmini-logo" />
                  <div className="nm">{t.name}</div>
                  <div className="v">{t.value}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="final-c">
      <div className="wrap">
        <h2>
          Open the <em>file</em> on every card.
        </h2>
        <p>150+ cards. Thousands of records. Free, forever, no email required to read.</p>
        <div className="ctas-row">
          <Link
            href="/explore"
            className="btn btn-accent"
            style={{ padding: '14px 22px', fontSize: 15 }}
          >
            Search a card →
          </Link>
          <Link
            href="/explore"
            className="btn btn-outline"
            style={{
              padding: '14px 22px',
              fontSize: 15,
              background: 'transparent',
              color: '#fff',
              borderColor: 'rgba(255,255,255,0.3)',
            }}
          >
            Browse all cards
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function LandingClient({
  initialCards,
  news,
  articles,
  bestPages,
  trendingViews,
  editorialViews,
}: LandingClientProps) {
  return (
    <div className="landing-v2 landing-v3">
      <Hero cards={initialCards} />
      <section className="lanes">
        <div className="wrap">
          <PopularLane cards={initialCards} trendingViews={trendingViews} />
          <BestForLane bestPages={bestPages} />
          <NewsLane news={news} articles={articles} editorialViews={editorialViews} />
        </div>
      </section>
      <FooterBlocks cards={initialCards} />
      <FinalCTA />
      <V2Footer />
    </div>
  );
}
