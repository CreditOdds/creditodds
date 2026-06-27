'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
import CardImage from '@/components/ui/CardImage';
import { useAuth } from '@/auth/AuthProvider';
import { cardMatchesSearch } from '@/lib/searchAliases';
import { SPEND_BUCKETS, SPEND_BUCKET_LABELS } from '@/lib/nextCardRanking';
import type { Card, SignupBonus } from '@/lib/api';

// ---- Result shape returned by /api/best-card-for-me -------------------------

interface RecCard {
  slug: string;
  card_name: string;
  bank: string;
  card_image_link?: string;
  apply_link?: string;
  special_apply_link?: string;
  reward_type?: 'cashback' | 'points' | 'miles';
  annual_fee?: number;
  signup_bonus?: SignupBonus;
}
interface Recommendation {
  rank: number;
  blurb: string;
  netAnnualValue: number;
  rewardsValue: number;
  creditsValue: number;
  annualFee: number;
  winningCategories: { category: string; annualValue: number }[];
  matchedCredits: { name: string; value: number; category: string }[];
  card: RecCard;
}

// ---- Quiz options -----------------------------------------------------------

const REWARD_OPTIONS: { value: 'cashback' | 'points' | null; label: string; sub: string }[] = [
  { value: 'cashback', label: 'Cash back', sub: 'Simple statement credits' },
  { value: 'points', label: 'Points & miles', sub: 'Maximize travel value' },
  { value: null, label: 'No preference', sub: 'Show me the best value' },
];

const ALLEGIANCE_OPTIONS = [
  { value: null, label: 'No allegiance' },
  { value: 'delta', label: 'Delta' },
  { value: 'united', label: 'United' },
  { value: 'american', label: 'American' },
  { value: 'southwest', label: 'Southwest' },
  { value: 'jetblue', label: 'JetBlue' },
  { value: 'alaska', label: 'Alaska' },
  { value: 'marriott', label: 'Marriott' },
  { value: 'hilton', label: 'Hilton' },
  { value: 'hyatt', label: 'Hyatt' },
];

// ---- Wizard state -----------------------------------------------------------

interface QuizState {
  rewardType: 'cashback' | 'points' | null;
  allegiance: string | null;
  monthlySpend: Record<string, number>;
  walletSlugs: string[];
}

const STORAGE_KEY = 'bcfm_quiz_state_v1';

const initialState: QuizState = {
  rewardType: null,
  allegiance: null,
  monthlySpend: Object.fromEntries(SPEND_BUCKETS.map((b) => [b, 0])),
  walletSlugs: [],
};

type Action =
  | { type: 'set'; key: keyof QuizState; value: QuizState[keyof QuizState] }
  | { type: 'setSpend'; bucket: string; value: number }
  | { type: 'toggleCard'; slug: string }
  | { type: 'hydrate'; value: QuizState };

function reducer(state: QuizState, action: Action): QuizState {
  switch (action.type) {
    case 'set':
      return { ...state, [action.key]: action.value };
    case 'setSpend':
      return { ...state, monthlySpend: { ...state.monthlySpend, [action.bucket]: action.value } };
    case 'toggleCard': {
      const has = state.walletSlugs.includes(action.slug);
      return {
        ...state,
        walletSlugs: has
          ? state.walletSlugs.filter((s) => s !== action.slug)
          : [...state.walletSlugs, action.slug],
      };
    }
    case 'hydrate':
      return action.value;
    default:
      return state;
  }
}

const STEPS = ['Rewards', 'Allegiance', 'Spending', 'Your cards'] as const;

export default function BestCardForMeClient({ allCards }: { allCards: Card[] }) {
  const { authState, signInWithGoogle } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<'quiz' | 'gate' | 'results'>('quiz');
  const [results, setResults] = useState<Recommendation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist answers so a sign-in redirect round-trip doesn't lose them.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) dispatch({ type: 'hydrate', value: JSON.parse(saved) });
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

  const slugToCard = useMemo(() => new Map(allCards.map((c) => [c.slug, c])), [allCards]);

  async function fetchResults() {
    setLoading(true);
    setError(null);
    try {
      const annualSpend: Record<string, number> = {};
      for (const [bucket, monthly] of Object.entries(state.monthlySpend)) {
        if (monthly > 0) annualSpend[bucket] = monthly * 12;
      }
      const res = await fetch('/api/best-card-for-me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spend: annualSpend,
          walletSlugs: state.walletSlugs,
          rewardType: state.rewardType,
          allegiance: state.allegiance,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong');
      }
      const data = await res.json();
      setResults(data.recommendations);
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

  // ---- Render ---------------------------------------------------------------

  if (phase === 'results' && results) {
    return <Results results={results} onRestart={() => { setPhase('quiz'); setStep(0); setResults(null); }} />;
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
          <StepShell title="Any airline or hotel you're loyal to?" subtitle="Optional. It helps us value your points the way you'd actually use them.">
            <div className="bcfm-chips">
              {ALLEGIANCE_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  className={`bcfm-chip ${state.allegiance === opt.value ? 'is-selected' : ''}`}
                  onClick={() => dispatch({ type: 'set', key: 'allegiance', value: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="Roughly how much do you spend each month?" subtitle="Ballpark is fine. Leave a category at 0 if it doesn't apply.">
            <div className="bcfm-spend-grid">
              {SPEND_BUCKETS.map((bucket) => (
                <label key={bucket} className="bcfm-spend-row">
                  <span className="bcfm-spend-label">{SPEND_BUCKET_LABELS[bucket]}</span>
                  <span className="bcfm-spend-input">
                    <span className="bcfm-dollar">$</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={state.monthlySpend[bucket] || ''}
                      placeholder="0"
                      onChange={(e) =>
                        dispatch({ type: 'setSpend', bucket, value: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                    <span className="bcfm-permo">/mo</span>
                  </span>
                </label>
              ))}
            </div>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="Which cards do you already have?" subtitle="We only recommend cards that beat what's already in your wallet.">
            <ExistingCardsPicker
              allCards={allCards}
              selected={state.walletSlugs}
              slugToCard={slugToCard}
              onToggle={(slug) => dispatch({ type: 'toggleCard', slug })}
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
  onToggle,
}: {
  allCards: Card[];
  selected: string[];
  slugToCard: Map<string, Card>;
  onToggle: (slug: string) => void;
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
          {selected.map((slug) => {
            const c = slugToCard.get(slug);
            if (!c) return null;
            return (
              <button key={slug} className="bcfm-selected-chip" onClick={() => onToggle(slug)}>
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
            const isSel = selected.includes(c.slug);
            return (
              <li key={c.slug}>
                <button
                  className={`bcfm-search-item ${isSel ? 'is-selected' : ''}`}
                  onClick={() => {
                    onToggle(c.slug);
                    setQuery('');
                  }}
                >
                  <CardImage cardImageLink={c.card_image_link} alt={c.card_name} width={40} height={25} />
                  <span>{c.card_name}</span>
                  {isSel && <span className="bcfm-check">Added</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="bcfm-hint">Don&apos;t have any yet? Just continue, and we&apos;ll rank from scratch.</p>
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

function Results({ results, onRestart }: { results: Recommendation[]; onRestart: () => void }) {
  if (results.length === 0) {
    return (
      <div className="bcfm-results-empty">
        <h2>No clear upgrades right now.</h2>
        <p>Your current cards already cover your spending well. Add more spending detail or try again later.</p>
        <button className="bcfm-btn bcfm-btn-primary" onClick={onRestart}>
          Start over
        </button>
      </div>
    );
  }
  return (
    <div className="bcfm-results">
      <h2 className="bcfm-results-title">Your best cards to get next</h2>
      <p className="bcfm-results-sub">Ranked by the ongoing value each adds on top of the cards you already have.</p>
      <ol className="bcfm-rec-list">
        {results.map((r) => (
          <RecCardRow key={r.card.slug} rec={r} />
        ))}
      </ol>
      <button className="bcfm-btn bcfm-btn-ghost" onClick={onRestart}>
        Start over
      </button>
    </div>
  );
}

function RecCardRow({ rec }: { rec: Recommendation }) {
  const c = rec.card;
  const applyUrl = c.apply_link || c.special_apply_link;
  return (
    <li className="bcfm-rec">
      <div className="bcfm-rec-rank">{rec.rank}</div>
      <div className="bcfm-rec-img">
        <CardImage cardImageLink={c.card_image_link} alt={c.card_name} width={120} height={75} />
      </div>
      <div className="bcfm-rec-body">
        <h3 className="bcfm-rec-name">{c.card_name}</h3>
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
          <span>Rewards ${rec.rewardsValue.toLocaleString()}/yr</span>
          {rec.creditsValue > 0 && <span>Credits ${rec.creditsValue.toLocaleString()}/yr</span>}
          {rec.annualFee > 0 ? <span>Fee ${rec.annualFee}</span> : <span>No annual fee</span>}
        </div>
        {rec.matchedCredits.length > 0 && (
          <p className="bcfm-rec-credits">
            Counts credits you&apos;d use: {rec.matchedCredits.map((m) => `${m.name} ($${m.value})`).join(', ')}
          </p>
        )}
        {c.signup_bonus && c.signup_bonus.value > 0 && (
          <p className="bcfm-rec-sub">
            Bonus: {c.signup_bonus.value.toLocaleString()} {c.signup_bonus.type} after $
            {c.signup_bonus.spend_requirement.toLocaleString()} in {c.signup_bonus.timeframe_months} mo
          </p>
        )}
      </div>
      <div className="bcfm-rec-cta">
        {applyUrl && (
          <a className="bcfm-btn bcfm-btn-primary" href={applyUrl} target="_blank" rel="noopener noreferrer">
            View card
          </a>
        )}
        <a className="bcfm-rec-link" href={`/card/${c.slug}`}>
          Details
        </a>
      </div>
    </li>
  );
}
