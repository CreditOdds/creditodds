'use client';

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/auth/AuthProvider";
import { checkOdds, CheckOddsCard, CheckOddsResponse, getWallet, WalletCard } from "@/lib/api";
import { calculateApplicationRules, RuleResult } from "@/lib/applicationRules";
import { cardMatchesSearch } from "@/lib/searchAliases";

type SortOption = 'match' | 'name' | 'bank';

const CACHE_KEY = 'check-odds-results';

function saveResultsToCache(data: CheckOddsResponse) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* ignore quota errors */ }
}

function loadResultsFromCache(): CheckOddsResponse | null {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

function formatIncome(value: string): string {
  const num = value.replace(/[^0-9]/g, '');
  if (!num) return '';
  return Number(num).toLocaleString();
}

function parseIncome(formatted: string): number {
  return Number(formatted.replace(/[^0-9]/g, '')) || 0;
}

export default function CheckOddsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authState, getToken } = useAuth();

  // Restore cached results on mount
  const cached = typeof window !== 'undefined' ? loadResultsFromCache() : null;

  // Form state — URL params take priority, then cached search, then empty
  const [creditScore, setCreditScore] = useState(
    searchParams.get('cs') || (cached ? String(cached.search.credit_score) : '')
  );
  const [income, setIncome] = useState(
    searchParams.get('income')
      ? formatIncome(searchParams.get('income')!)
      : cached ? formatIncome(String(cached.search.income)) : ''
  );
  const [lengthCredit, setLengthCredit] = useState(
    searchParams.get('cl') || (cached ? String(cached.search.length_credit) : '')
  );

  // Results state — restore from cache
  const [results, setResults] = useState<CheckOddsResponse | null>(cached);
  const [walletCards, setWalletCards] = useState<WalletCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filter state
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('match');

  const handleSubmit = useCallback(async (cs?: string, inc?: string, cl?: string) => {
    const csVal = parseInt(cs || creditScore);
    const incVal = parseIncome(inc || income);
    const clVal = parseInt(cl || lengthCredit);

    if (!csVal || csVal < 300 || csVal > 850) {
      setError('Credit score must be between 300 and 850');
      return;
    }
    if (incVal < 0) {
      setError('Income must be 0 or greater');
      return;
    }
    if (isNaN(clVal) || clVal < 0 || clVal > 100) {
      setError('Credit length must be between 0 and 100 years');
      return;
    }

    // If not authenticated, redirect to login with params
    if (!authState.isAuthenticated) {
      const params = new URLSearchParams({
        redirect: '/check-odds',
        cs: csVal.toString(),
        income: incVal.toString(),
        cl: clVal.toString(),
      });
      router.push(`/login?${params.toString()}`);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const [data, wallet] = await Promise.all([
        checkOdds(
          { credit_score: csVal, income: incVal, length_credit: clVal },
          token
        ),
        getWallet(token).catch(() => [] as WalletCard[]),
      ]);
      setResults(data);
      setWalletCards(wallet);
      saveResultsToCache(data);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'Failed to check odds');
    } finally {
      setLoading(false);
    }
  }, [creditScore, income, lengthCredit, authState.isAuthenticated, getToken, router]);

  // Auto-submit if URL has params and user is authenticated
  useEffect(() => {
    const cs = searchParams.get('cs');
    const inc = searchParams.get('income');
    const cl = searchParams.get('cl');

    if (cs && inc && cl && authState.isAuthenticated && !authState.isLoading && !results) {
      setCreditScore(cs);
      setIncome(formatIncome(inc));
      setLengthCredit(cl);
      handleSubmit(cs, inc, cl);
    }
  }, [authState.isAuthenticated, authState.isLoading, searchParams, handleSubmit, results]);

  // Filter and sort results
  const filteredCards = useMemo(() => {
    if (!results) return [];

    let filtered = results.cards.filter(card =>
      cardMatchesSearch(card.card_name, card.bank, search)
    );

    switch (sortBy) {
      case 'match':
        filtered.sort((a, b) => {
          if (b.match_score !== a.match_score) return b.match_score - a.match_score;
          if (b.has_enough_data !== a.has_enough_data) return b.has_enough_data ? 1 : -1;
          return (b.total_records || 0) - (a.total_records || 0);
        });
        break;
      case 'name':
        filtered.sort((a, b) => a.card_name.localeCompare(b.card_name));
        break;
      case 'bank':
        filtered.sort((a, b) => a.bank.localeCompare(b.bank) || a.card_name.localeCompare(b.card_name));
        break;
    }

    return filtered;
  }, [results, search, sortBy]);

  const matchCounts = useMemo(() => {
    if (!results) return { three: 0, two: 0, one: 0, zero: 0, noData: 0 };
    const cards = results.cards;
    return {
      three: cards.filter(c => c.has_enough_data && c.match_score === 3).length,
      two: cards.filter(c => c.has_enough_data && c.match_score === 2).length,
      one: cards.filter(c => c.has_enough_data && c.match_score === 1).length,
      zero: cards.filter(c => c.has_enough_data && c.match_score === 0).length,
      noData: cards.filter(c => !c.has_enough_data).length,
    };
  }, [results]);

  const ruleByBank = useMemo(() => {
    const rules = calculateApplicationRules(walletCards);
    const map: Record<string, RuleResult> = {};
    for (const rule of rules) {
      map[rule.bank] = rule;
    }
    return map;
  }, [walletCards]);

  const hasWalletDates = useMemo(
    () => walletCards.some((c) => c.acquired_year),
    [walletCards]
  );

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-indigo-600" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
        <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
          Check Your Odds
        </h1>
      </div>
      <p className="mt-2 text-center text-lg text-gray-500">
        Enter your credit profile and see how you stack up against approved applicants
      </p>

      {/* Input Form */}
      <div className="mt-6 bg-white shadow rounded-lg p-6 max-w-2xl mx-auto">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="credit-score" className="block text-sm font-medium text-gray-700">
                Credit Score
              </label>
              <input
                id="credit-score"
                type="number"
                min={300}
                max={850}
                required
                placeholder="300-850"
                value={creditScore}
                onChange={(e) => setCreditScore(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="income" className="block text-sm font-medium text-gray-700">
                Annual Income
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">$</span>
                </div>
                <input
                  id="income"
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="75,000"
                  value={income}
                  onChange={(e) => setIncome(formatIncome(e.target.value))}
                  className="block w-full pl-7 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
              </div>
            </div>
            <div>
              <label htmlFor="length-credit" className="block text-sm font-medium text-gray-700">
                Credit History (years)
              </label>
              <input
                id="length-credit"
                type="number"
                min={0}
                max={100}
                required
                placeholder="0-100"
                value={lengthCredit}
                onChange={(e) => setLengthCredit(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Checking...' : 'Check Odds'}
          </button>

          {!authState.isAuthenticated && (
            <p className="text-xs text-center text-gray-500">
              Sign in is required to view results
            </p>
          )}
        </form>
      </div>

      {/* Results */}
      {results && (
        <>
          {/* Summary */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-3 max-w-3xl mx-auto">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{matchCounts.three}</div>
              <div className="text-xs text-green-600">3/3 Match</div>
            </div>
            <div className="bg-lime-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-lime-700">{matchCounts.two}</div>
              <div className="text-xs text-lime-600">2/3 Match</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-700">{matchCounts.one}</div>
              <div className="text-xs text-amber-600">1/3 Match</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-red-700">{matchCounts.zero}</div>
              <div className="text-xs text-red-600">0/3 Match</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center col-span-2 sm:col-span-1">
              <div className="text-2xl font-bold text-gray-500">{matchCounts.noData}</div>
              <div className="text-xs text-gray-400">Collecting Data</div>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-6 flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="result-search" className="sr-only">Search results</label>
              <input
                type="text"
                id="result-search"
                placeholder="Search cards..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>
            <div className="sm:w-48">
              <label htmlFor="result-sort" className="sr-only">Sort by</label>
              <select
                id="result-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                <option value="match">Sort by Match Score</option>
                <option value="name">Sort by Name</option>
                <option value="bank">Sort by Bank</option>
              </select>
            </div>
          </div>

          <p className="mt-3 text-sm text-gray-500">
            Showing {filteredCards.length} of {results.cards.length} cards
          </p>

          {/* Results Table */}
          <div className="mt-4 flex flex-col -mx-4 sm:mx-0 overflow-hidden">
            <div className="-my-2 sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                          Card
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 hidden sm:table-cell">
                          Credit Score
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 hidden sm:table-cell">
                          Income
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 hidden sm:table-cell">
                          Credit History
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 hidden sm:table-cell">
                          Bank Rules
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {filteredCards.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-gray-500">
                            No cards match your search.
                          </td>
                        </tr>
                      ) : (
                        filteredCards.map((card) => (
                          <tr key={card.card_id} className="hover:bg-gray-50">
                            <td className="py-3 pl-3 pr-2 sm:py-4 sm:pl-6 sm:pr-3">
                              <Link href={`/card/${card.slug}`} className="flex items-center group">
                                <div className="h-8 w-12 sm:h-10 sm:w-16 flex-shrink-0 mr-3">
                                  <Image
                                    src={card.card_image_link
                                      ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                                      : '/assets/generic-card.svg'}
                                    alt={card.card_name}
                                    width={64}
                                    height={40}
                                    className="h-8 w-12 sm:h-10 sm:w-16 object-contain"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-indigo-600 group-hover:text-indigo-900 truncate">
                                    {card.card_name}
                                  </div>
                                  <div className="text-xs text-gray-500">{card.bank}</div>
                                  {/* Mobile inline indicators */}
                                  <div className="sm:hidden mt-0.5">
                                    {card.has_enough_data ? (
                                      <div className="flex items-center gap-2 text-[11px]">
                                        <MobileIndicator label="Score" isAbove={card.above_credit_score!} median={card.median_credit_score!} />
                                        <MobileIndicator label="Income" isAbove={card.above_income!} median={card.median_income!} isCurrency />
                                        <MobileIndicator label="History" isAbove={card.above_length_credit!} median={card.median_length_credit!} suffix="yr" />
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-gray-400 italic">
                                        Still collecting ({card.approved_data_points}/5)
                                      </span>
                                    )}
                                    {ruleByBank[card.bank] && (
                                      <div className="mt-0.5">
                                        {hasWalletDates ? (
                                          <RuleProgressBar rule={ruleByBank[card.bank]} size="sm" />
                                        ) : (
                                          <RuleCaution rule={ruleByBank[card.bank]} size="sm" />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </Link>
                            </td>
                            {card.has_enough_data ? (
                              <>
                                {/* Desktop columns */}
                                <td className="whitespace-nowrap px-3 py-4 text-center text-sm hidden sm:table-cell">
                                  <MedianIndicator
                                    value={results.search.credit_score}
                                    median={card.median_credit_score!}
                                    isAbove={card.above_credit_score!}
                                  />
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-center text-sm hidden sm:table-cell">
                                  <MedianIndicator
                                    value={results.search.income}
                                    median={card.median_income!}
                                    isAbove={card.above_income!}
                                    isCurrency
                                  />
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-center text-sm hidden sm:table-cell">
                                  <MedianIndicator
                                    value={results.search.length_credit}
                                    median={card.median_length_credit!}
                                    isAbove={card.above_length_credit!}
                                    suffix=" yr"
                                  />
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-center text-sm hidden sm:table-cell">
                                  <BankRuleCell rule={ruleByBank[card.bank]} hasWalletDates={hasWalletDates} />
                                </td>
                              </>
                            ) : (
                              <>
                                <td colSpan={3} className="whitespace-nowrap px-3 py-4 text-center text-sm text-gray-400 italic hidden sm:table-cell">
                                  Still collecting results ({card.approved_data_points}/5 approved)
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-center text-sm hidden sm:table-cell">
                                  <BankRuleCell rule={ruleByBank[card.bank]} hasWalletDates={hasWalletDates} />
                                </td>
                              </>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function MedianIndicator({
  value,
  median,
  isAbove,
  isCurrency,
  suffix,
}: {
  value: number;
  median: number;
  isAbove: boolean;
  isCurrency?: boolean;
  suffix?: string;
}) {
  const formatVal = (n: number) => {
    if (isCurrency) return `$${n.toLocaleString()}`;
    return `${n.toLocaleString()}${suffix || ''}`;
  };

  return (
    <div className="flex flex-col items-center">
      <span className={`inline-flex items-center text-xs font-medium ${isAbove ? 'text-green-700' : 'text-red-700'}`}>
        {isAbove ? (
          <svg className="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
        ) : (
          <svg className="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
        )}
        {isAbove ? 'Above' : 'Below'}
      </span>
      <span className="text-xs text-gray-500 mt-0.5">
        median {formatVal(median)}
      </span>
    </div>
  );
}

function MobileIndicator({
  label,
  isAbove,
  median,
  isCurrency,
  suffix,
}: {
  label: string;
  isAbove: boolean;
  median: number;
  isCurrency?: boolean;
  suffix?: string;
}) {
  const formatted = isCurrency
    ? `$${median >= 1000 ? `${Math.round(median / 1000)}k` : median}`
    : `${median}${suffix ? suffix : ''}`;

  return (
    <span className={isAbove ? 'text-green-700' : 'text-red-700'}>
      {label} {isAbove ? '\u2191' : '\u2193'} {formatted}
    </span>
  );
}

function MatchBadge({ score }: { score: number }) {
  const colors = {
    3: 'bg-green-100 text-green-800',
    2: 'bg-lime-100 text-lime-800',
    1: 'bg-amber-100 text-amber-800',
    0: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${colors[score as keyof typeof colors] || colors[0]}`}>
      {score}/3
    </span>
  );
}

function BankRuleCell({ rule, hasWalletDates }: { rule?: RuleResult; hasWalletDates: boolean }) {
  if (!rule) return <span className="text-gray-400">&mdash;</span>;
  if (hasWalletDates) return <RuleProgressBar rule={rule} size="md" />;
  return <RuleCaution rule={rule} size="md" />;
}

function RuleProgressBar({ rule, size }: { rule: RuleResult; size: 'sm' | 'md' }) {
  const pct = Math.min((rule.current / rule.limit) * 100, 100);
  const barColor = rule.isSafe
    ? 'bg-green-500'
    : rule.current === rule.limit
      ? 'bg-red-500'
      : 'bg-amber-500';

  if (size === 'sm') {
    return (
      <span className={`text-[11px] ${rule.isSafe ? 'text-green-700' : 'text-red-700'}`}>
        {rule.ruleName} {rule.current}/{rule.limit}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs font-medium text-gray-700">{rule.ruleName}</span>
      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium ${rule.isSafe ? 'text-green-700' : 'text-red-700'}`}>
        {rule.current}/{rule.limit}
      </span>
    </div>
  );
}

function RuleCaution({ rule, size }: { rule: RuleResult; size: 'sm' | 'md' }) {
  const tooltip = `Add cards to your wallet to track progress towards ${rule.ruleName}`;

  if (size === 'sm') {
    return (
      <span className="relative group/tip text-[11px] text-amber-600 cursor-default">
        &#9888; {rule.ruleName}
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/tip:block w-44 rounded bg-gray-900 px-2 py-1 text-[10px] text-white text-center z-10">
          {tooltip}
        </span>
      </span>
    );
  }

  return (
    <div className="relative group/tip flex flex-col items-center gap-0.5 cursor-default">
      <span className="text-xs text-amber-600">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 inline -mt-0.5">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
        </svg>
        {' '}{rule.ruleName}
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/tip:block w-48 rounded bg-gray-900 px-2 py-1.5 text-xs text-white text-center z-10">
        {tooltip}
      </span>
    </div>
  );
}
