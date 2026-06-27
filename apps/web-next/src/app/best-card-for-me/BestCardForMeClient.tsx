'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { useAuth } from '@/auth/AuthProvider';
import { cardMatchesSearch } from '@/lib/searchAliases';
import { SPEND_BUCKETS, SPEND_BUCKET_LABELS } from '@/lib/nextCardRanking';
import { getWallet, addToWallet, type Card, type SignupBonus } from '@/lib/api';
import { createCardLookups } from '@/app/profile/profileSelectors';
import { CategoryIcon } from '@/lib/cardDisplayUtils';

// ---- Result shape returned by /api/best-card-for-me -------------------------

interface RecCard {
  slug: string;
  card_name: string;
  bank: string;
  card_image_link?: string;
  reward_type?: 'cashback' | 'points' | 'miles';
  annual_fee?: number;
  signup_bonus?: SignupBonus;
}
interface CategoryRow {
  category: string;
  spend: number;
  currentRate: number;
  currentCard: string | null;
  currentCardImage: string | null;
  newRate: number;
  delta: number;
  helps: boolean;
}
interface Recommendation {
  rank: number;
  blurb: string;
  netAnnualValue: number;
  rewardsValue: number;
  annualFee: number;
  winningCategories: { category: string; annualValue: number }[];
  categories: CategoryRow[];
  card: RecCard;
}
interface WalletTierRow {
  rate: number;
  card: string | null;
  cardImage: string | null;
  spend: number;
}
interface WalletRow {
  category: string;
  spend: number;
  earned: number;
  best: WalletTierRow;
  next: WalletTierRow | null;
}

// ---- Quiz options -----------------------------------------------------------

const REWARD_OPTIONS: { value: 'cashback' | 'points' | null; label: string; sub: string }[] = [
  { value: 'cashback', label: 'Cash back', sub: 'Simple statement credits' },
  { value: 'points', label: 'Points & miles', sub: 'Maximize travel value' },
  { value: null, label: 'No preference', sub: 'Show me the best value' },
];

const AIRLINE_OPTIONS = [
  { value: 'delta', label: 'Delta' },
  { value: 'united', label: 'United' },
  { value: 'american', label: 'American' },
  { value: 'southwest', label: 'Southwest' },
  { value: 'jetblue', label: 'JetBlue' },
  { value: 'alaska', label: 'Alaska' },
];

const HOTEL_OPTIONS = [
  { value: 'marriott', label: 'Marriott' },
  { value: 'hilton', label: 'Hilton' },
  { value: 'hyatt', label: 'Hyatt' },
  { value: 'ihg', label: 'IHG' },
];

// Brand logos we ship (public/logos). Programs without a logo render text-only.
const ALLEGIANCE_LOGOS: Record<string, string> = {
  delta: '/logos/delta.jpg',
  united: '/logos/united.jpg',
  southwest: '/logos/southwest.jpg',
  marriott: '/logos/marriott.jpg',
  hilton: '/logos/hilton.jpg',
  hyatt: '/logos/hyatt.jpg',
  ihg: '/logos/ihg.jpg',
};

function AllegianceChip({
  value,
  label,
  selected,
  onClick,
}: {
  value: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const logo = ALLEGIANCE_LOGOS[value];
  return (
    <button className={`bcfm-chip ${selected ? 'is-selected' : ''}`} onClick={onClick}>
      {logo && (
        <Image src={logo} alt={label} width={16} height={16} className="bcfm-chip-logo" />
      )}
      {label}
    </button>
  );
}

// Quick-start spending profiles. Clicking one populates every category's
// monthly estimate; the user can then fine-tune any row. Values are rough
// monthly dollars per bucket.
const SPEND_PROFILES: { key: string; label: string; spend: Record<string, number> }[] = [
  { key: 'low', label: 'Low spender', spend: { dining: 80, groceries: 200, gas: 60, travel: 50, transit: 20, online_shopping: 60, streaming: 20, everything_else: 300 } },
  { key: 'conservative', label: 'Conservative', spend: { dining: 150, groceries: 350, gas: 100, travel: 100, transit: 40, online_shopping: 120, streaming: 30, everything_else: 500 } },
  { key: 'moderate', label: 'Moderate', spend: { dining: 300, groceries: 500, gas: 150, travel: 250, transit: 80, online_shopping: 200, streaming: 45, everything_else: 900 } },
  { key: 'high', label: 'High', spend: { dining: 600, groceries: 800, gas: 250, travel: 600, transit: 150, online_shopping: 400, streaming: 60, everything_else: 1800 } },
  { key: 'very_high', label: 'Very high', spend: { dining: 1200, groceries: 1200, gas: 400, travel: 1500, transit: 300, online_shopping: 800, streaming: 80, everything_else: 3500 } },
  { key: 'eat_out', label: 'Eats out all the time', spend: { dining: 1000, groceries: 150, gas: 120, travel: 200, transit: 100, online_shopping: 150, streaming: 40, everything_else: 700 } },
  { key: 'avid_diner', label: 'Avid diner', spend: { dining: 700, groceries: 600, gas: 120, travel: 300, transit: 60, online_shopping: 150, streaming: 40, everything_else: 700 } },
  { key: 'avid_traveler', label: 'Avid traveler', spend: { dining: 350, groceries: 300, gas: 150, travel: 1500, transit: 200, online_shopping: 200, streaming: 40, everything_else: 900 } },
];

// ---- Wizard state -----------------------------------------------------------

interface QuizState {
  rewardType: 'cashback' | 'points' | null;
  allegiances: string[];
  monthlySpend: Record<string, number>;
  walletSlugs: string[];
}

const STORAGE_KEY = 'bcfm_quiz_state_v1';
// Bump this when the persisted results shape changes so stale cached results
// (e.g. from a build before a new field) are discarded instead of restored.
const RESULTS_KEY = 'bcfm_results_v2';

const initialState: QuizState = {
  rewardType: null,
  allegiances: [],
  monthlySpend: Object.fromEntries(SPEND_BUCKETS.map((b) => [b, 0])),
  walletSlugs: [],
};

type Action =
  | { type: 'set'; key: keyof QuizState; value: QuizState[keyof QuizState] }
  | { type: 'setSpend'; bucket: string; value: number }
  | { type: 'setAllSpend'; value: Record<string, number> }
  | { type: 'toggleAllegiance'; value: string }
  | { type: 'addCard'; slug: string }
  | { type: 'removeCard'; slug: string }
  | { type: 'hydrate'; value: QuizState };

function reducer(state: QuizState, action: Action): QuizState {
  switch (action.type) {
    case 'set':
      return { ...state, [action.key]: action.value };
    case 'setSpend':
      return { ...state, monthlySpend: { ...state.monthlySpend, [action.bucket]: action.value } };
    case 'setAllSpend':
      return { ...state, monthlySpend: { ...action.value } };
    case 'toggleAllegiance': {
      const has = state.allegiances.includes(action.value);
      return {
        ...state,
        allegiances: has
          ? state.allegiances.filter((a) => a !== action.value)
          : [...state.allegiances, action.value],
      };
    }
    case 'addCard':
      return { ...state, walletSlugs: [...state.walletSlugs, action.slug] };
    case 'removeCard': {
      const idx = state.walletSlugs.indexOf(action.slug);
      if (idx === -1) return state;
      const next = state.walletSlugs.slice();
      next.splice(idx, 1);
      return { ...state, walletSlugs: next };
    }
    case 'hydrate':
      return action.value;
    default:
      return state;
  }
}

const STEPS = ['Rewards', 'Allegiance', 'Spending', 'Your cards'] as const;

export default function BestCardForMeClient({ allCards }: { allCards: Card[] }) {
  const { authState, signInWithGoogle, getToken } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<'quiz' | 'gate' | 'results'>('quiz');
  const [results, setResults] = useState<Recommendation[] | null>(null);
  const [walletAnalysis, setWalletAnalysis] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletPrefilled, setWalletPrefilled] = useState(false);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);

  // Persist answers so a sign-in redirect round-trip doesn't lose them, and
  // restore completed results so navigating away and back doesn't restart the
  // survey.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) dispatch({ type: 'hydrate', value: JSON.parse(saved) });
      const savedResults = sessionStorage.getItem(RESULTS_KEY);
      if (savedResults) {
        const parsed = JSON.parse(savedResults);
        if (parsed.results) {
          setResults(parsed.results);
          setWalletAnalysis(parsed.walletAnalysis || []);
          setPhase('results');
        }
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);
  useEffect(() => {
    try {
      if (phase === 'results' && results) {
        sessionStorage.setItem(RESULTS_KEY, JSON.stringify({ results, walletAnalysis }));
      }
    } catch {
      /* ignore */
    }
  }, [phase, results, walletAnalysis]);

  const slugToCard = useMemo(() => new Map(allCards.map((c) => [c.slug, c])), [allCards]);

  // Map a user's stored wallet (numeric card_ids) back to catalog slugs.
  // One slug per wallet ROW, so two of the same card surface as two entries
  // (important for the stacked-cap calculus, e.g. two Citi Custom Cash).
  const walletToSlugs = useMemo(() => {
    const lookups = createCardLookups(allCards);
    return (wallet: { card_id: number; card_name: string }[]) =>
      wallet
        .map((w) => (lookups.byWalletId.get(w.card_id) ?? lookups.byName.get(w.card_name))?.slug)
        .filter((s): s is string => !!s);
  }, [allCards]);

  // Signed-in users: pull their current cards from their wallet instead of
  // asking. Only overrides the picker when the wallet actually has cards.
  useEffect(() => {
    if (!authState.isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const wallet = await getWallet(token);
        if (cancelled || wallet.length === 0) return;
        const slugs = walletToSlugs(wallet);
        if (slugs.length === 0) return;
        dispatch({ type: 'set', key: 'walletSlugs', value: slugs });
        setWalletPrefilled(true);
      } catch {
        /* no wallet yet — fall back to asking */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.isAuthenticated]);

  // Resolve the wallet slugs to rank against, and (for a brand-new signed-in
  // user with no wallet) seed their wallet from the cards they entered — which
  // also creates their profile. Never seeds when a wallet already exists.
  async function resolveWalletSlugs(token: string): Promise<string[]> {
    // Already loaded (and possibly edited) their existing wallet at start —
    // rank against that view, and never reseed a wallet that already exists.
    if (walletPrefilled) return state.walletSlugs;

    let wallet: { card_id: number; card_name: string }[] = [];
    try {
      wallet = await getWallet(token);
    } catch {
      wallet = [];
    }
    if (wallet.length > 0) return walletToSlugs(wallet);

    for (const slug of state.walletSlugs) {
      const card = slugToCard.get(slug);
      if (card?.db_card_id) {
        try {
          await addToWallet(card.db_card_id, undefined, undefined, token);
        } catch {
          /* skip cards that fail to add */
        }
      }
    }
    return state.walletSlugs;
  }

  async function fetchResults() {
    setLoading(true);
    setError(null);
    try {
      let walletSlugs = state.walletSlugs;
      if (authState.isAuthenticated) {
        const token = await getToken();
        if (token) walletSlugs = await resolveWalletSlugs(token);
      }
      const annualSpend: Record<string, number> = {};
      for (const [bucket, monthly] of Object.entries(state.monthlySpend)) {
        if (monthly > 0) annualSpend[bucket] = monthly * 12;
      }
      const res = await fetch('/api/best-card-for-me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spend: annualSpend,
          walletSlugs,
          rewardType: state.rewardType,
          allegiances: state.allegiances,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong');
      }
      const data = await res.json();
      setResults(data.recommendations);
      setWalletAnalysis(data.walletAnalysis || []);
      setPhase('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  // After the gate: sign in (if needed), then reveal.
  async function handleReveal() {
    if (!authState.isAuthenticated) {
      try {
        await signInWithGoogle();
      } catch {
        return; // user closed the popup
      }
    }
    await fetchResults();
  }

  // If already signed in when reaching the gate, reveal immediately.
  useEffect(() => {
    if (phase === 'gate' && authState.isAuthenticated && !results && !loading) {
      void fetchResults();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, authState.isAuthenticated]);

  const hasAnySpend = Object.values(state.monthlySpend).some((v) => v > 0);
  const monthlyTotal = Object.values(state.monthlySpend).reduce((sum, v) => sum + (v || 0), 0);

  // ---- Render ---------------------------------------------------------------

  if (phase === 'results' && results) {
    return (
      <Results
        results={results}
        walletAnalysis={walletAnalysis}
        onRestart={() => {
          setPhase('quiz');
          setStep(0);
          setResults(null);
          setWalletAnalysis([]);
          try {
            sessionStorage.removeItem(RESULTS_KEY);
          } catch {
            /* ignore */
          }
        }}
      />
    );
  }

  if (phase === 'gate') {
    return (
      <Gate loading={loading} error={error} onReveal={handleReveal} onBack={() => setPhase('quiz')} />
    );
  }

  return (
    <div className="bcfm-wizard">
      <ProgressBar step={step} total={STEPS.length} />

      <div className="bcfm-step">
        {step === 0 && (
          <StepShell title="What kind of rewards do you want?" subtitle="We'll weight the ranking toward your preference.">
            <div className="bcfm-options">
              {REWARD_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  className={`bcfm-option ${state.rewardType === opt.value ? 'is-selected' : ''}`}
                  onClick={() => dispatch({ type: 'set', key: 'rewardType', value: opt.value })}
                >
                  <span className="bcfm-option-label">{opt.label}</span>
                  <span className="bcfm-option-sub">{opt.sub}</span>
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {step === 1 && (
          <StepShell
            title="Any airlines or hotels you're loyal to?"
            subtitle="Optional. Pick as many as you like. It helps us value your points the way you'd actually use them."
          >
            <p className="bcfm-group-label">Airlines</p>
            <div className="bcfm-chips">
              {AIRLINE_OPTIONS.map((opt) => (
                <AllegianceChip
                  key={opt.value}
                  value={opt.value}
                  label={opt.label}
                  selected={state.allegiances.includes(opt.value)}
                  onClick={() => dispatch({ type: 'toggleAllegiance', value: opt.value })}
                />
              ))}
            </div>
            <p className="bcfm-group-label">Hotels</p>
            <div className="bcfm-chips">
              {HOTEL_OPTIONS.map((opt) => (
                <AllegianceChip
                  key={opt.value}
                  value={opt.value}
                  label={opt.label}
                  selected={state.allegiances.includes(opt.value)}
                  onClick={() => dispatch({ type: 'toggleAllegiance', value: opt.value })}
                />
              ))}
            </div>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell
            title="Roughly how much do you spend each month?"
            subtitle="Start from a profile, then fine-tune. Leave a category at 0 if it doesn't apply."
          >
            <div className="bcfm-profile-chips">
              {SPEND_PROFILES.map((p) => (
                <button
                  key={p.key}
                  className={`bcfm-chip ${activeProfile === p.key ? 'is-selected' : ''}`}
                  onClick={() => {
                    dispatch({ type: 'setAllSpend', value: { ...p.spend } });
                    setActiveProfile(p.key);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="bcfm-spend-grid">
              {SPEND_BUCKETS.map((bucket) => (
                <label key={bucket} className="bcfm-spend-row">
                  <span className="bcfm-spend-label">
                    <CategoryIcon category={bucket} className="bcfm-spend-icon" />
                    {SPEND_BUCKET_LABELS[bucket]}
                  </span>
                  <span className="bcfm-spend-input">
                    <span className="bcfm-dollar">$</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={state.monthlySpend[bucket] || ''}
                      placeholder="0"
                      onChange={(e) => {
                        setActiveProfile(null);
                        dispatch({ type: 'setSpend', bucket, value: Math.max(0, Number(e.target.value) || 0) });
                      }}
                    />
                    <span className="bcfm-permo">/mo</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="bcfm-spend-total">
              <span className="bcfm-spend-total-label">Total monthly spend</span>
              <span className="bcfm-spend-total-value">
                ${monthlyTotal.toLocaleString()}
                <span>/mo</span>
              </span>
            </div>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell
            title={walletPrefilled ? 'Your wallet' : 'Which cards do you already have?'}
            subtitle={
              walletPrefilled
                ? 'We pulled these from your account. Add or remove any to adjust.'
                : "We only recommend cards that beat what's already in your wallet."
            }
          >
            <ExistingCardsPicker
              allCards={allCards}
              selected={state.walletSlugs}
              slugToCard={slugToCard}
              onAdd={(slug) => dispatch({ type: 'addCard', slug })}
              onRemoveOne={(slug) => dispatch({ type: 'removeCard', slug })}
            />
          </StepShell>
        )}
      </div>

      <div className="bcfm-nav">
        {step > 0 ? (
          <button className="bcfm-btn bcfm-btn-ghost" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <button className="bcfm-btn bcfm-btn-primary" onClick={() => setStep(step + 1)}>
            Continue
          </button>
        ) : (
          <button
            className="bcfm-btn bcfm-btn-primary"
            disabled={!hasAnySpend}
            onClick={() => setPhase('gate')}
          >
            See my top 5
          </button>
        )}
      </div>
      {!hasAnySpend && step === STEPS.length - 1 && (
        <p className="bcfm-hint">Add at least one spending category to get recommendations.</p>
      )}
    </div>
  );
}

// ---- Sub-components ----------------------------------------------------------

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="bcfm-progress">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`bcfm-progress-seg ${i <= step ? 'is-done' : ''}`} />
      ))}
    </div>
  );
}

function StepShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bcfm-step-shell">
      <h2 className="bcfm-step-title">{title}</h2>
      {subtitle && <p className="bcfm-step-sub">{subtitle}</p>}
      {children}
    </div>
  );
}

function ExistingCardsPicker({
  allCards,
  selected,
  slugToCard,
  onAdd,
  onRemoveOne,
}: {
  allCards: Card[];
  selected: string[];
  slugToCard: Map<string, Card>;
  onAdd: (slug: string) => void;
  onRemoveOne: (slug: string) => void;
}) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    return allCards
      .filter((c) => cardMatchesSearch(c.card_name, c.bank, query))
      .slice(0, 6);
  }, [query, allCards]);

  return (
    <div className="bcfm-cards-picker">
      {selected.length > 0 && (
        <div className="bcfm-selected-cards">
          {/* One chip per copy: a card added twice shows up twice. */}
          {selected.map((slug, i) => {
            const c = slugToCard.get(slug);
            if (!c) return null;
            return (
              <button
                key={`${slug}-${i}`}
                className="bcfm-selected-chip"
                onClick={() => onRemoveOne(slug)}
                aria-label={`Remove ${c.card_name}`}
              >
                <CardImage
                  cardImageLink={c.card_image_link}
                  alt={c.card_name}
                  width={30}
                  height={19}
                />
                {c.card_name}
                <span aria-hidden className="bcfm-x">×</span>
              </button>
            );
          })}
        </div>
      )}
      <input
        className="bcfm-search"
        type="text"
        placeholder="Search for a card you have…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {matches.length > 0 && (
        <ul className="bcfm-search-results">
          {matches.map((c) => {
            const count = selected.filter((s) => s === c.slug).length;
            return (
              <li key={c.slug}>
                <button
                  className={`bcfm-search-item ${count > 0 ? 'is-selected' : ''}`}
                  onClick={() => {
                    onAdd(c.slug);
                    setQuery('');
                  }}
                >
                  <CardImage cardImageLink={c.card_image_link} alt={c.card_name} width={40} height={25} />
                  <span>{c.card_name}</span>
                  {count > 0 && <span className="bcfm-check">Added{count > 1 ? ` ×${count}` : ''}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="bcfm-hint">
        Have two of the same card? Add it twice. Don&apos;t have any yet? Just continue, and we&apos;ll
        rank from scratch.
      </p>
    </div>
  );
}

function Gate({
  loading,
  error,
  onReveal,
  onBack,
}: {
  loading: boolean;
  error: string | null;
  onReveal: () => void;
  onBack: () => void;
}) {
  return (
    <div className="bcfm-gate">
      <div className="bcfm-gate-teaser" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="bcfm-gate-row">
            <span className="bcfm-gate-rank">{n}</span>
            <span className="bcfm-gate-blur" />
          </div>
        ))}
      </div>
      <div className="bcfm-gate-cta">
        <h2>Your top 5 are ready.</h2>
        <p>Sign in to reveal the cards we picked for your spending.</p>
        {error && <p className="bcfm-error">{error}</p>}
        <button className="bcfm-btn bcfm-btn-primary" onClick={onReveal} disabled={loading}>
          {loading ? 'Crunching the numbers…' : 'Sign in & reveal my ranking'}
        </button>
        <button className="bcfm-btn bcfm-btn-ghost" onClick={onBack} disabled={loading}>
          Back to quiz
        </button>
      </div>
    </div>
  );
}

// Format an effective cents-per-dollar rate (e.g. 5 → "5%", 4.8 → "4.8%").
function formatRate(rate: number): string {
  const r = Math.round(rate * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}%`;
}

// A rate plus the card that provides it (image + name), used in both tables.
function RateWithCard({
  rate,
  card,
  cardImage,
}: {
  rate: number;
  card: string | null;
  cardImage: string | null;
}) {
  return (
    <span className="bcfm-rate-cell">
      {formatRate(rate)}
      {card && (
        <span className="bcfm-rate-card">
          {cardImage && (
            <CardImage cardImageLink={cardImage} alt={card} width={26} height={16} />
          )}
          <span className="bcfm-table-sub">{card}</span>
        </span>
      )}
    </span>
  );
}

function WalletTable({ rows }: { rows: WalletRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="bcfm-wallet-analysis">
      <h3 className="bcfm-section-h">Your wallet today</h3>
      <p className="bcfm-section-sub">
        What your cards earn now, and where spending falls once a card&apos;s monthly cap is hit
        (e.g. Custom Cash&apos;s 5% stops after $500/mo). Wherever &quot;the rest&quot; drops to a low
        rate is a gap a new card can fill.
      </p>
      <div className="bcfm-table-wrap">
        <table className="bcfm-table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Spend / yr</th>
              <th>Best rate now</th>
              <th>Then on the rest</th>
              <th className="num">Earns / yr</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category}>
                <td>
                  <span className="bcfm-table-cat">
                    <CategoryIcon category={r.category} className="bcfm-table-icon" />
                    {SPEND_BUCKET_LABELS[r.category] || r.category}
                  </span>
                </td>
                <td className="num">${r.spend.toLocaleString()}</td>
                <td>
                  <RateWithCard rate={r.best.rate} card={r.best.card} cardImage={r.best.cardImage} />
                  {r.next && (
                    <span className="bcfm-tier-amt">first ${r.best.spend.toLocaleString()}/yr</span>
                  )}
                </td>
                <td>
                  {r.next ? (
                    <>
                      {r.next.card ? (
                        <RateWithCard
                          rate={r.next.rate}
                          card={r.next.card}
                          cardImage={r.next.cardImage}
                        />
                      ) : (
                        <span className="bcfm-rate-cell">
                          {formatRate(r.next.rate)}
                          <span className="bcfm-table-sub">no bonus</span>
                        </span>
                      )}
                      <span className="bcfm-tier-amt">next ${r.next.spend.toLocaleString()}/yr</span>
                    </>
                  ) : (
                    <span className="bcfm-muted">—</span>
                  )}
                </td>
                <td className="num">${r.earned.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryBreakdownTable({ categories }: { categories: CategoryRow[] }) {
  return (
    <table className="bcfm-table bcfm-table-compact">
      <thead>
        <tr>
          <th>Category</th>
          <th>You earn now</th>
          <th>With this card</th>
          <th className="num">Added / yr</th>
        </tr>
      </thead>
      <tbody>
        {categories.map((cat) => (
          <tr key={cat.category} className={cat.helps ? 'helps' : ''}>
            <td>
              <span className="bcfm-table-cat">
                <CategoryIcon category={cat.category} className="bcfm-table-icon" />
                {SPEND_BUCKET_LABELS[cat.category] || cat.category}
              </span>
            </td>
            <td>
              <RateWithCard
                rate={cat.currentRate}
                card={cat.currentCard}
                cardImage={cat.currentCardImage}
              />
            </td>
            <td>
              {!cat.helps ? (
                <span className="bcfm-muted">no change</span>
              ) : cat.newRate > cat.currentRate ? (
                formatRate(cat.newRate)
              ) : (
                // Helps by covering more spend at the same headline rate (it
                // earns above an owned card's cap), so a rate-to-rate compare
                // would misleadingly read "5% → 5%".
                <span className="bcfm-muted">more spend rewarded</span>
              )}
            </td>
            <td className={`num ${cat.delta > 0 ? 'pos' : ''}`}>
              {cat.delta > 0 ? `+$${cat.delta.toLocaleString()}` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Results({
  results,
  walletAnalysis,
  onRestart,
}: {
  results: Recommendation[];
  walletAnalysis: WalletRow[];
  onRestart: () => void;
}) {
  return (
    <div className="bcfm-results">
      <h2 className="bcfm-results-title">Your best cards to get next</h2>
      <p className="bcfm-results-sub">
        Ranked by the ongoing value each adds on top of the cards you already have.
      </p>

      <WalletTable rows={walletAnalysis} />

      {results.length === 0 ? (
        <div className="bcfm-results-empty">
          <h3 className="bcfm-section-h">No clear upgrades right now</h3>
          <p>
            Your current cards already cover this spending well. Nothing in the catalog beats them by
            enough to be worth another annual fee or hard pull.
          </p>
        </div>
      ) : (
        <>
          <h3 className="bcfm-section-h">Recommended additions</h3>
          <ol className="bcfm-rec-list">
            {results.map((r) => (
              <RecCardRow key={r.card.slug} rec={r} />
            ))}
          </ol>
        </>
      )}

      <button className="bcfm-btn bcfm-btn-ghost" onClick={onRestart}>
        Start over
      </button>
    </div>
  );
}

function RecCardRow({ rec }: { rec: Recommendation }) {
  const c = rec.card;
  const cardUrl = `/card/${c.slug}`;
  return (
    <li className="bcfm-rec">
      <div className="bcfm-rec-rank">{rec.rank}</div>
      <Link className="bcfm-rec-img" href={cardUrl}>
        <CardImage cardImageLink={c.card_image_link} alt={c.card_name} width={120} height={75} />
      </Link>
      <div className="bcfm-rec-body">
        <h3 className="bcfm-rec-name">
          <Link href={cardUrl}>{c.card_name}</Link>
        </h3>
        <p className="bcfm-rec-value">
          +${rec.netAnnualValue.toLocaleString()}<span>/yr over your wallet</span>
        </p>
        {rec.blurb && <p className="bcfm-rec-blurb">{rec.blurb}</p>}
        <div className="bcfm-rec-cats">
          {rec.winningCategories.slice(0, 4).map((w) => (
            <span key={w.category} className="bcfm-rec-cat">
              {SPEND_BUCKET_LABELS[w.category] || w.category}
            </span>
          ))}
        </div>
        <div className="bcfm-rec-breakdown">
          <span>Rewards ${rec.rewardsValue.toLocaleString()}/yr on your spending</span>
          {rec.annualFee > 0 ? <span>Fee ${rec.annualFee}</span> : <span>No annual fee</span>}
        </div>
        {c.signup_bonus && c.signup_bonus.value > 0 && (
          <p className="bcfm-rec-sub">
            Bonus: {c.signup_bonus.value.toLocaleString()} {c.signup_bonus.type} after $
            {c.signup_bonus.spend_requirement.toLocaleString()} in {c.signup_bonus.timeframe_months} mo
          </p>
        )}
        {rec.categories.length > 0 && (
          <details className="bcfm-rec-details">
            <summary>How it changes each category</summary>
            <CategoryBreakdownTable categories={rec.categories} />
          </details>
        )}
      </div>
      <div className="bcfm-rec-cta">
        <Link className="bcfm-btn bcfm-btn-primary" href={cardUrl}>
          View card
        </Link>
      </div>
    </li>
  );
}
