'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import CardImage from '@/components/ui/CardImage';
import { Card } from '@/lib/api';
import { cardMatchesSearch } from '@/lib/searchAliases';
import { V2Footer } from '@/components/landing-v2/Chrome';
import './landing.css';

interface LandingClientProps {
  initialCards: Card[];
}

type TickerItem = {
  card: string;
  score: number;
  income: number;
  age: string;
  verdict: 'app' | 'den';
};

const HEADLINE = {
  pre: 'See your ',
  em: 'real odds',
  post: ' before you apply.',
};

function computeOdds(card: Card, score: number, incomeK: number): number {
  const minScore = card.approved_median_credit_score
    ? Math.max(600, card.approved_median_credit_score - 30)
    : 680;
  const minIncome = card.approved_median_income
    ? Math.max(20, card.approved_median_income / 1000 - 20)
    : 50;
  const approvedCount = card.approved_count ?? 0;
  const rejectedCount = card.rejected_count ?? 0;
  const total = approvedCount + rejectedCount;
  const baseOdds = total > 0 ? Math.max(0.2, Math.min(0.9, approvedCount / total)) : 0.65;

  const scoreDelta = (score - minScore) / 60;
  const incomeDelta = (incomeK - minIncome) / 50;
  const p = baseOdds + scoreDelta * 0.12 + incomeDelta * 0.06;
  return Math.max(0.05, Math.min(0.97, p)) * 100;
}

function verdictFor(pct: number) {
  if (pct >= 75) return { label: 'Likely approved', chip: 'Strong', klass: '' };
  if (pct >= 50) return { label: 'Decent shot', chip: 'Fair', klass: '' };
  if (pct >= 30) return { label: 'Long shot', chip: 'Risk', klass: 'warn' };
  return { label: 'Probably denied', chip: 'Deny', klass: 'warn' };
}

function OddsRing({ pct }: { pct: number }) {
  const r = 48;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  const warn = pct < 50;
  return (
    <div className={'odds-ring ' + (warn ? 'warn' : '')}>
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" strokeWidth="6" className="track" />
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          className="fill"
        />
      </svg>
      <div className="center">
        <div>
          <div className="pct">
            {Math.round(pct)}
            <span style={{ fontSize: '18px', color: 'var(--muted)' }}>%</span>
          </div>
          <div className="pct-s">Your odds</div>
        </div>
      </div>
    </div>
  );
}

function OddsWidget({ cards }: { cards: Card[] }) {
  const router = useRouter();
  const activeCards = useMemo(
    () =>
      cards
        .filter((c) => c.accepting_applications)
        .sort((a, b) => (b.approved_count ?? 0) + (b.rejected_count ?? 0) - ((a.approved_count ?? 0) + (a.rejected_count ?? 0))),
    [cards]
  );

  const [sel, setSel] = useState<Card>(activeCards[0] ?? cards[0]);
  const [query, setQuery] = useState('');
  const [score, setScore] = useState(740);
  const [income, setIncome] = useState(85);
  const [listOpen, setListOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query) return activeCards;
    return activeCards.filter((c) =>
      cardMatchesSearch(c.card_name, c.bank, query)
    );
  }, [query, activeCards]);

  const odds = useMemo(() => computeOdds(sel, score, income), [sel, score, income]);
  const verdict = verdictFor(odds);

  const approvals = sel.approved_count ?? 0;
  const denials = sel.rejected_count ?? 0;
  const total = approvals + denials;

  return (
    <div className="widget">
      <div className="widget-head">
        <div className="t">
          <b>ODDS CALCULATOR</b> · real data, not a soft pull
        </div>
        <div className="t">v2.6</div>
      </div>
      <div className="widget-body">
        <div className="card-search">
          <svg
            className="search-icon"
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
            placeholder="Search 140+ cards: Sapphire, Amex Gold, Venture X…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setListOpen(true);
            }}
            onFocus={() => setListOpen(true)}
          />
        </div>
        <button
          type="button"
          className="selected-card"
          onClick={() => setListOpen((open) => !open)}
          aria-label={`Selected card: ${sel.card_name}. Open card picker.`}
        >
          <div className="selected-card-thumb">
            <CardImage
              cardImageLink={sel.card_image_link}
              alt=""
              fill
              sizes="48px"
              style={{ objectFit: 'cover' }}
            />
          </div>
          <div className="selected-card-meta">
            <div className="selected-card-label">Selected card</div>
            <div className="selected-card-name">{sel.card_name}</div>
            <div className="selected-card-sub">
              {sel.bank} · {total} record{total === 1 ? '' : 's'}
            </div>
          </div>
          <div className="selected-card-action">{listOpen ? 'Hide' : 'Change'}</div>
        </button>
        {listOpen && filtered.length > 0 && (
          <div className="card-list">
            {filtered.slice(0, 6).map((c) => (
              <button
                key={c.slug}
                type="button"
                className={'card-opt ' + (c.slug === sel.slug ? 'active' : '')}
                onClick={() => {
                  setSel(c);
                  setListOpen(false);
                  setQuery('');
                }}
              >
                <div className="card-thumb">
                  <CardImage
                    cardImageLink={c.card_image_link}
                    alt=""
                    fill
                    sizes="42px"
                    style={{ objectFit: 'cover' }}
                  />
                </div>
                <div>
                  <div className="name">{c.card_name}</div>
                  <div className="issuer">{c.bank}</div>
                </div>
                <div className="records">
                  {(c.approved_count ?? 0) + (c.rejected_count ?? 0)} rec
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="inputs-row">
          <div className="field">
            <label>Credit score</label>
            <div className="input-wrap">
              <div className="val">
                {score} <span className="unit">FICO</span>
              </div>
              <input
                type="range"
                min={550}
                max={850}
                step={5}
                value={score}
                className="slider"
                onChange={(e) => setScore(+e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label>Annual income</label>
            <div className="input-wrap">
              <div className="val">
                ${income}K <span className="unit">/yr</span>
              </div>
              <input
                type="range"
                min={20}
                max={300}
                step={5}
                value={income}
                className="slider"
                onChange={(e) => setIncome(+e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="result">
          <OddsRing pct={odds} />
          <div className="meta">
            <div className="verdict">
              {verdict.label}
              <span className={'chip ' + verdict.klass}>{verdict.chip}</span>
            </div>
            <div className="desc">
              Based on <b>{total}</b> real applications for the <b>{sel.card_name}</b>,
              filtered to profiles near yours.
            </div>
            {total > 0 && (
              <div className="dist-bar">
                <div className="seg app" style={{ flex: approvals }} />
                <div className="seg den" style={{ flex: denials }} />
                <span className="leg" style={{ marginLeft: 8 }}>
                  {approvals} approved · {denials} denied
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="widget-foot">
        <span>No soft pull · No account required</span>
        <button
          type="button"
          onClick={() => router.push(`/card/${sel.slug}`)}
          style={{
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            color: 'var(--ink)',
            fontWeight: 500,
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          See full breakdown →
        </button>
      </div>
    </div>
  );
}

function Hero({ cards }: { cards: Card[] }) {
  return (
    <section className="hero wrap">
      <div className="hero-grid">
        <div>
          <div className="eyebrow hero-eyebrow">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--accent)',
              }}
            />
            <span>
              <b>Community-powered</b> · crowdsourced approval data
            </span>
          </div>
          <h1 className="hero-title">
            {HEADLINE.pre}
            <em>{HEADLINE.em}</em>
            {HEADLINE.post}
          </h1>
          <p className="hero-sub">
            CreditOdds is a crowdsourced approval database for 140+ credit cards. See how
            people with your score, income, and credit history actually fared — before you
            take the hard pull.
          </p>
          <div className="hero-cta">
            <Link href="/check-odds" className="btn btn-primary">
              Check your odds
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
            <Link href="/explore" className="btn btn-outline">
              Explore 140+ cards
            </Link>
            <span className="note">free · no signup required</span>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <div className="n">
                {cards.length}
                <span className="sup">+</span>
              </div>
              <div className="l">Cards tracked</div>
            </div>
            <div className="stat">
              <div className="n">500+</div>
              <div className="l">Records submitted</div>
            </div>
            <div className="stat">
              <div className="n">$0</div>
              <div className="l">To use, forever</div>
            </div>
          </div>
        </div>
        <OddsWidget cards={cards} />
      </div>
    </section>
  );
}

function Ticker({ cards }: { cards: Card[] }) {
  const items = useMemo<TickerItem[]>(() => {
    const shuffled = [...cards]
      .filter((c) => (c.approved_count ?? 0) + (c.rejected_count ?? 0) > 0)
      .slice(0, 10);
    return shuffled.map((c, i) => ({
      card: c.card_name,
      score: 640 + ((i * 37) % 120),
      income: 38 + ((i * 13) % 90),
      age: `${1 + ((i * 3) % 8)}y`,
      verdict: (c.approved_count ?? 0) >= (c.rejected_count ?? 0) ? 'app' : 'den',
    }));
  }, [cards]);

  const doubled = [...items, ...items];
  return (
    <div className="ticker">
      <div className="ticker-track">
        {doubled.map((t, i) => (
          <span className="ticker-item" key={i}>
            <span className="card-name">{t.card}</span>
            <span>
              FICO <b style={{ color: 'var(--ink)' }}>{t.score}</b>
            </span>
            <span className="sep">·</span>
            <span>${t.income}K</span>
            <span className="sep">·</span>
            <span>{t.age} history</span>
            <span className={'pill ' + t.verdict}>
              {t.verdict === 'app' ? 'APPROVED' : 'DENIED'}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <section className="sec wrap" id="how">
      <div className="sec-head">
        <div>
          <div className="sec-label">How it works</div>
          <h2 className="sec-title">
            Stop guessing. <em>Calculate.</em>
          </h2>
        </div>
        <p className="lead">
          Every approval and denial on CreditOdds is submitted by a real person with real
          numbers. Search a card, compare your profile to everyone who applied before you,
          and know whether it&apos;s worth the hard pull.
        </p>
      </div>
      <div className="steps">
        <div className="step">
          <div className="num">01 / SEARCH</div>
          <h3>Pick a card.</h3>
          <p>
            Browse 140+ consumer and business cards across every major issuer. Each has a
            live record count.
          </p>
          <div className="step-visual">
            <div className="row">
              <span className="k">Sapphire Reserve</span>
              <span className="v">148 records</span>
            </div>
            <div className="row">
              <span className="k">Amex Gold</span>
              <span className="v">204 records</span>
            </div>
            <div className="row">
              <span className="k">Venture X</span>
              <span className="v">156 records</span>
            </div>
            <div className="row">
              <span className="k">Double Cash</span>
              <span className="v">402 records</span>
            </div>
          </div>
        </div>
        <div className="step">
          <div className="num">02 / COMPARE</div>
          <h3>Match your profile.</h3>
          <p>
            Score, income, credit length, existing cards. We filter records down to
            applicants who look like you.
          </p>
          <div className="step-visual">
            <div className="row">
              <span className="k">FICO</span>
              <span className="v">740 ±20</span>
            </div>
            <div className="row">
              <span className="k">Income</span>
              <span className="v">$85K ±$15K</span>
            </div>
            <div className="row">
              <span className="k">History</span>
              <span className="v">5–8 years</span>
            </div>
            <div className="row">
              <span className="k">Inquiries</span>
              <span className="v">2 / 6mo</span>
            </div>
          </div>
        </div>
        <div className="step">
          <div className="num">03 / DECIDE</div>
          <h3>Know your odds.</h3>
          <p>
            Get a real approval probability based on real data — plus the referral link
            that gives you the best bonus.
          </p>
          <div className="step-visual accent">
            <div className="row">
              <span className="k">Approval odds</span>
              <span className="v">78%</span>
            </div>
            <div className="row">
              <span className="k">Referral bonus</span>
              <span className="v">+15K pts</span>
            </div>
            <div className="row">
              <span className="k">Recommendation</span>
              <span className="v">APPLY</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Records() {
  const rows = [
    { u: 'JK', user: '@jkolin', d: '2d · CHI', card: 'Sapphire Reserve', score: 762, income: '$120K', status: 'app' as const },
    { u: 'RP', user: '@raelle_p', d: '3d · NYC', card: 'Amex Platinum', score: 710, income: '$95K', status: 'den' as const },
    { u: 'DS', user: '@dsirota', d: '5d · SF', card: 'Venture X', score: 741, income: '$84K', status: 'app' as const },
    { u: 'MN', user: '@m_nair', d: '6d · AUS', card: 'Citi Double Cash', score: 684, income: '$52K', status: 'app' as const },
    { u: 'TK', user: '@tkang', d: '1w · SEA', card: 'Bilt', score: 722, income: '$110K', status: 'pen' as const },
    { u: 'AL', user: '@alee', d: '1w · BOS', card: 'Amex Gold', score: 698, income: '$68K', status: 'den' as const },
  ];
  const statusLabel = { app: 'Approved', den: 'Denied', pen: 'Pending' };
  return (
    <section className="sec wrap" id="records">
      <div className="split reverse">
        <div className="visual">
          <div className="visual-card">
            <div className="vc-head">
              <div className="dot-row">
                <span />
                <span />
                <span />
              </div>
              <span style={{ marginLeft: 6 }}>records.creditodds.com</span>
              <span style={{ marginLeft: 'auto' }}>FILTER · FICO 680–760</span>
            </div>
            <div className="records-table">
              {rows.map((r, i) => (
                <div className="rec" key={i}>
                  <div className="avatar">{r.u}</div>
                  <div className="meta-user">
                    <div className="u">
                      {r.user} ·{' '}
                      <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                        {r.card}
                      </span>
                    </div>
                    <div className="d">{r.d}</div>
                  </div>
                  <div className="rec-details">
                    <div className="num">
                      <span className="l">Score</span>
                      {r.score}
                    </div>
                    <div className="num">
                      <span className="l">Income</span>
                      {r.income}
                    </div>
                    <div className={'status-chip ' + r.status}>{statusLabel[r.status]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="sec-label">Records</div>
          <h2 className="sec-title" style={{ marginBottom: 20 }}>
            Read the <em>room</em> before you read the fine print.
          </h2>
          <p className="body-copy">
            Each record is a real application: FICO, income, credit length, recent
            inquiries, and whether the issuer said yes. No affiliate spin, no editorial
            bias. Just what people actually submitted.
          </p>
          <div className="feature-grid">
            {[
              ['Anonymous', 'Nothing identifying is required or shown.'],
              ['Verified', 'Records flagged as suspicious are removed.'],
              ['Open data', 'Every record is queryable, not buried in blog posts.'],
              ['Freshness', 'Approval criteria change. Filter by recency.'],
            ].map(([t, d]) => (
              <div key={t} style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <div
                  style={{
                    fontFamily: "'Inter Tight', 'Inter', sans-serif",
                    fontSize: 18,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {t}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--muted)',
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {d}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Referrals({ cards }: { cards: Card[] }) {
  const featured = useMemo(() => {
    const bySlug = (slug: string) => cards.find((c) => c.slug === slug);
    return [
      bySlug('chase-sapphire-preferred'),
      bySlug('american-express-gold-card'),
      bySlug('capital-one-venture-rewards'),
    ].filter((c): c is Card => !!c);
  }, [cards]);

  const fallbackStats = [
    { clicks: 14, conv: 3, code: 'chase.com/r/k8nj2w' },
    { clicks: 28, conv: 5, code: 'amex.us/r/p2l0qx' },
    { clicks: 9, conv: 1, code: 'capone.com/r/h4xr81' },
  ];

  return (
    <section className="sec wrap" id="rewards">
      <div className="split">
        <div>
          <div className="sec-label">Referrals</div>
          <h2 className="sec-title" style={{ marginBottom: 20 }}>
            Submit a record. <em>Earn</em> on every click.
          </h2>
          <p className="body-copy">
            When you share your outcome, attach your referral link. We inject it for
            applicants whose profiles match yours — so the data you gave keeps paying you
            back.
          </p>
          <div className="cta-row">
            <Link href="/register" className="btn btn-primary">
              Start earning
            </Link>
            <Link href="/how" className="btn btn-outline">
              How payouts work
            </Link>
          </div>
        </div>
        <div className="visual">
          <div className="visual-card">
            <div className="vc-head">
              <div className="dot-row">
                <span />
                <span />
                <span />
              </div>
              <span style={{ marginLeft: 6 }}>@you · referral dashboard</span>
              <span style={{ marginLeft: 'auto' }}>LAST 30D</span>
            </div>
            <div className="ref-panel">
              {featured.map((c, i) => (
                <div className="ref-row" key={c.slug}>
                  <div className="ref-thumb">
                    <CardImage
                      cardImageLink={c.card_image_link}
                      alt=""
                      fill
                      sizes="44px"
                      style={{ objectFit: 'cover' }}
                    />
                  </div>
                  <div className="ref-meta">
                    <div className="ref-name">{c.card_name}</div>
                    <div className="ref-code">{fallbackStats[i]?.code}</div>
                  </div>
                  <div className="ref-stats">
                    <div className="big">{fallbackStats[i]?.clicks}</div>
                    <div className="lbl">Clicks</div>
                  </div>
                  <div className="ref-stats ref-stats-secondary">
                    <div className="big">{fallbackStats[i]?.conv}</div>
                    <div className="lbl">Conv.</div>
                  </div>
                </div>
              ))}
              <div className="ref-earnings">
                <span>Pending bonus · 30d</span>
                <span className="amt">+ 95,000 pts</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Wallet({ cards }: { cards: Card[] }) {
  const featured = useMemo(() => {
    const slugs = [
      'chase-sapphire-reserve',
      'the-platinum-card',
      'citi-custom-cash',
      'bilt-mastercard',
    ];
    return slugs
      .map((s) => cards.find((c) => c.slug === s))
      .filter((c): c is Card => !!c)
      .slice(0, 4);
  }, [cards]);

  const meta = [
    { opened: 'Jan 23', renews: 'Jan 27', tags: ['REC', 'REF'] },
    { opened: 'Mar 24', renews: 'Mar 27', tags: ['REC'] },
    { opened: 'Aug 24', renews: '—', tags: ['REF'] },
    { opened: 'Nov 25', renews: 'Nov 26', tags: ['REC', 'REF'] },
  ];

  return (
    <section className="sec wrap" id="wallet">
      <div className="split reverse">
        <div className="visual">
          <div className="visual-card">
            <div className="vc-head">
              <div className="dot-row">
                <span />
                <span />
                <span />
              </div>
              <span style={{ marginLeft: 6 }}>wallet · {featured.length} cards</span>
            </div>
            <div className="wallet-grid">
              {featured.map((c, i) => {
                const fee = c.annual_fee ? `$${c.annual_fee}/yr` : '$0/yr';
                return (
                  <div className="w-card" key={c.slug}>
                    <div className="w-top">
                      <div className="w-thumb">
                        <CardImage
                          cardImageLink={c.card_image_link}
                          alt=""
                          fill
                          sizes="48px"
                          style={{ objectFit: 'cover' }}
                        />
                      </div>
                      <div>
                        <div className="w-name">{c.card_name}</div>
                        <div className="w-iss">
                          {c.bank} · {fee}
                        </div>
                      </div>
                    </div>
                    <div className="w-rows">
                      <span className="k">Opened</span>
                      <span className="v">{meta[i].opened}</span>
                      <span className="k">Renews</span>
                      <span className="v">{meta[i].renews}</span>
                    </div>
                    <div className="w-tags">
                      {meta[i].tags.includes('REC') && (
                        <span className="w-tag rec">record</span>
                      )}
                      {meta[i].tags.includes('REF') && (
                        <span className="w-tag ref">referral</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div>
          <div className="sec-label">Wallet</div>
          <h2 className="sec-title" style={{ marginBottom: 20 }}>
            All your cards. <em>One page.</em>
          </h2>
          <p className="body-copy">
            Track annual fees, renewal dates, and which cards you&apos;ve submitted records
            and referrals for. Get personalized card news and benefit reminders — things
            your issuer won&apos;t tell you.
          </p>
          <div className="cta-row">
            <Link href="/register" className="btn btn-primary">
              Create free wallet
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Proof({ cards }: { cards: Card[] }) {
  const totalRecords = cards.reduce(
    (acc, c) => acc + (c.approved_count ?? 0) + (c.rejected_count ?? 0),
    0
  );
  const issuers = new Set(cards.map((c) => c.bank)).size;
  return (
    <section className="proof">
      <div className="wrap">
        <div className="proof-grid">
          <div className="proof-cell">
            <div className="pn">
              {totalRecords.toLocaleString()}
              <span className="sup">+</span>
            </div>
            <div className="pl">Records in the database</div>
          </div>
          <div className="proof-cell">
            <div className="pn">
              {cards.length}
              <span className="sup">+</span>
            </div>
            <div className="pl">Cards tracked · {issuers} issuers</div>
          </div>
          <div className="proof-cell">
            <div className="pn">
              87<span className="sup">%</span>
            </div>
            <div className="pl">Users who reported correct odds</div>
          </div>
          <div className="proof-cell">
            <div className="pn">$0</div>
            <div className="pl">Cost to use · forever</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Final() {
  return (
    <section className="final">
      <div className="wrap">
        <h2>
          Know before you <em>apply.</em>
        </h2>
        <p>
          Hundreds of real approvals and denials. No soft-pull sales funnel. Just the
          data.
        </p>
        <div className="final-actions">
          <Link
            href="/check-odds"
            className="btn btn-primary"
            style={{ padding: '14px 22px', fontSize: 15 }}
          >
            Check your odds
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
            >
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/register"
            className="btn btn-outline"
            style={{ padding: '14px 22px', fontSize: 15 }}
          >
            Create account
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function LandingClient({ initialCards }: LandingClientProps) {
  return (
    <div className="landing-v2">
      <Hero cards={initialCards} />
      <Ticker cards={initialCards} />
      <HowItWorks />
      <Records />
      <Referrals cards={initialCards} />
      <Wallet cards={initialCards} />
      <Proof cards={initialCards} />
      <Final />
      <V2Footer />
    </div>
  );
}
