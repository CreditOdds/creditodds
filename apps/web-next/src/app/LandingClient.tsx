'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import CardImage from '@/components/ui/CardImage';
import { categoryLabels, pickHeadlineReward } from '@/lib/cardDisplayUtils';
import { cardMatchesSearch, expandSearchTerm } from '@/lib/searchAliases';
import { V2Footer } from '@/components/landing-v2/Chrome';
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
  cardImages: { src?: string; alt: string }[];
};
export type LandingNewsItem = {
  id: string;
  title: string;
  date: string;
  cardImages: { src?: string; alt: string }[];
};
export type LandingBestPage = {
  slug: string;
  title: string;
  cardSlugs: string[];
};

interface LandingClientProps {
  initialCards: LandingCard[];
  news: LandingNewsItem[];
  articles: LandingArticle[];
  bestPages: LandingBestPage[];
}

const TOOL_LINKS: { name: string; value: string; href: string }[] = [
  { name: 'Chase UR', value: '1 ≈ 1.25¢', href: '/tools/chase-ultimate-rewards-to-usd' },
  { name: 'Amex MR', value: '1 ≈ 1.2¢', href: '/tools/amex-membership-rewards-to-usd' },
  { name: 'Cap One miles', value: '1 ≈ 1.0¢', href: '/tools/capital-one-miles-to-usd' },
  { name: 'Bilt points', value: '1 ≈ 1.5¢', href: '/tools/bilt-rewards-points-to-usd' },
  { name: 'Hyatt points', value: '1 ≈ 2.0¢', href: '/tools/world-of-hyatt-points-to-usd' },
  { name: 'Delta SkyMiles', value: '1 ≈ 1.1¢', href: '/tools/delta-skymiles-to-usd' },
  { name: 'United miles', value: '1 ≈ 1.2¢', href: '/tools/united-miles-to-usd' },
  { name: 'Marriott', value: '1 ≈ 0.7¢', href: '/tools/marriott-bonvoy-points-to-usd' },
];

const WALLET_SLUGS = ['chase-sapphire-reserve', 'the-platinum-card', 'bilt-mastercard'];
const WALLET_RENEWALS = ['Renews Jan 27', 'Renews Mar 27', 'Renews in 11d'];

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

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return cards
      .filter((c) => cardMatchesSearch(c.card_name, c.bank, q))
      .map((c) => ({ c, s: searchRelevance(c, q) }))
      .sort((a, b) => b.s - a.s || a.c.card_name.localeCompare(b.c.card_name))
      .slice(0, 6)
      .map(({ c }) => c);
  }, [query, cards]);

  function go(slug: string) {
    router.push(`/card/${slug}`);
  }

  return (
    <section className="hero-c">
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
                if (matches[0]) go(matches[0].slug);
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
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                aria-label="Search any card"
              />
              <span className="kbd">Enter ↵</span>
            </form>

            {open && query.trim() && (
              <div className="search-results" role="listbox">
                {matches.length === 0 ? (
                  <div className="opt-empty">No cards match &ldquo;{query}&rdquo;.</div>
                ) : (
                  matches.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/card/${c.slug}`}
                      className="opt"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <div className="opt-thumb">
                        <CardImage cardImageLink={c.card_image_link} alt="" fill sizes="44px" style={{ objectFit: 'cover' }} />
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

function PopularLane({ cards }: { cards: LandingCard[] }) {
  const popular = useMemo(() => {
    const active = cards.filter((c) => c.accepting_applications);
    const hasRecords = active.some((c) => totalRecords(c) > 0);
    if (hasRecords) {
      return [...active].sort((a, b) => totalRecords(b) - totalRecords(a)).slice(0, 8);
    }
    // Fallback for envs without record counts (local dev): curated set + first cards.
    const bySlug = new Map(active.map((c) => [c.slug, c]));
    const curated = POPULAR_FALLBACK.map((s) => bySlug.get(s)).filter((c): c is LandingCard => !!c);
    const seen = new Set(curated.map((c) => c.slug));
    const rest = active.filter((c) => !seen.has(c.slug));
    return [...curated, ...rest].slice(0, 8);
  }, [cards]);

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
                  <CardImage cardImageLink={c.card_image_link} alt="" fill sizes="56px" style={{ objectFit: 'cover' }} />
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

function BestForLane({
  bestPages,
  cards,
}: {
  bestPages: LandingBestPage[];
  cards: LandingCard[];
}) {
  const nameBySlug = useMemo(() => {
    const m = new Map<string, string>();
    cards.forEach((c) => m.set(c.slug, shortName(c)));
    return m;
  }, [cards]);

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
            <div className="top3">
              {page.cardSlugs.map((slug, i) => (
                <div className="row" key={slug}>
                  <span className="r">{i + 1}</span>
                  <span>{nameBySlug.get(slug) ?? slug}</span>
                </div>
              ))}
            </div>
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
  cardImages: { src?: string; alt: string }[];
};

function NewsLane({
  news,
  articles,
}: {
  news: LandingNewsItem[];
  articles: LandingArticle[];
}) {
  const items = useMemo<EditorialItem[]>(() => {
    const fromArticles: EditorialItem[] = articles.map((a) => ({
      href: `/articles/${a.slug}`,
      tag: a.tag || 'Article',
      date: formatNewsDate(a.date),
      title: a.title,
      cardImages: a.cardImages,
    }));
    const fromNews: EditorialItem[] = news.map((n) => ({
      href: `/news/${n.id}`,
      tag: 'News',
      date: formatNewsDate(n.date),
      title: n.title,
      cardImages: n.cardImages,
    }));
    return [...fromArticles, ...fromNews].slice(0, 6);
  }, [news, articles]);

  if (items.length === 0) return null;

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
      <div className="lane-track">
        {items.map((it, i) => (
          <Link key={it.href + i} href={it.href} className="lna">
            <div className="cv">
              <div className="stack">
                {(it.cardImages.length > 0
                  ? it.cardImages
                  : [{ src: undefined, alt: '' }]
                )
                  .slice(0, 3)
                  .map((img, j, arr) => {
                    const center = (arr.length - 1) / 2;
                    const offset = j - center;
                    return (
                      <div
                        key={j}
                        className="stack-item"
                        style={{
                          transform: `rotate(${offset * 8}deg) translateY(${
                            arr.length > 1 && j === Math.round(center) ? -8 : 0
                          }px)`,
                        }}
                      >
                        <CardImage
                          cardImageLink={img.src}
                          alt=""
                          fill
                          sizes="86px"
                          style={{ objectFit: 'cover' }}
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
            <div className="bd">
              <div className="meta">
                <span className="tag">{it.tag}</span>
                <span>{it.date}</span>
              </div>
              <h4>{it.title}</h4>
            </div>
          </Link>
        ))}
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
              {walletCards.map((c, i) => (
                <div className="wm-row" key={c.slug}>
                  <div className="wm-thumb">
                    <CardImage cardImageLink={c.card_image_link} alt="" fill sizes="50px" style={{ objectFit: 'cover' }} />
                  </div>
                  <div>
                    <div className="nm">{shortName(c)}</div>
                    <div className="iss">{c.bank}</div>
                  </div>
                  <div className="v">
                    ${c.annual_fee ?? 0}
                    <span className="sub">{WALLET_RENEWALS[i]}</span>
                  </div>
                </div>
              ))}
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
                <div>
                  <div className="nm">Approval odds</div>
                  <div className="v">Real probability · live data</div>
                </div>
                <span style={{ fontSize: 18 }}>→</span>
              </Link>
              {TOOL_LINKS.map((t) => (
                <Link key={t.href} href={t.href} className="tmini">
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
        <p>140+ cards. Thousands of records. Free, forever, no email required to read.</p>
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
}: LandingClientProps) {
  return (
    <div className="landing-v2 landing-v3">
      <Hero cards={initialCards} />
      <section className="lanes">
        <div className="wrap">
          <PopularLane cards={initialCards} />
          <BestForLane bestPages={bestPages} cards={initialCards} />
          <NewsLane news={news} articles={articles} />
        </div>
      </section>
      <FooterBlocks cards={initialCards} />
      <FinalCTA />
      <V2Footer />
    </div>
  );
}
