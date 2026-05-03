import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllStores, getStore, type Store } from "@/lib/stores";
import { getAllCards, type Card, type Reward } from "@/lib/api";
import { getValuation } from "@/lib/valuations";
import { BreadcrumbSchema, FAQSchema } from "@/components/seo/JsonLd";
import CardImage from "@/components/ui/CardImage";
import { V2Footer } from "@/components/landing-v2/Chrome";
import { PencilSquareIcon, ExclamationTriangleIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import "../../landing.css";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const stores = await getAllStores();
  return stores.map(s => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStore(slug);
  if (!store) return {};
  const title = `Best Credit Card to Use at ${store.name}`;
  const description = `The best credit cards for ${store.name} purchases — co-branded options, category bonuses, and flat-rate cashback picks compared.`;
  const url = `https://creditodds.com/best-card-for/${store.slug}`;
  return {
    title,
    description,
    openGraph: { title: `${title} | CreditOdds`, description, url, type: "website" },
    alternates: { canonical: url },
  };
}

type MatchMode =
  | 'direct'              // category bonus that always applies (no activation needed)
  | 'rotating_current'    // quarterly rotation; this category is in `current_categories`
  | 'rotating_eligible'   // quarterly rotation; in `eligible_categories` but not currently active
  | 'user_choice'         // user selects N categories from `eligible_categories`
  | 'top_spend';          // auto: pays headline rate on whichever eligible category is your top spend

type Channel = 'both' | 'online' | 'in_store';

interface RankedPick {
  card: Card;
  rate: number;
  unit: 'percent' | 'points_per_dollar';
  effectiveRate: number;  // cashback-equivalent % for honest cross-card ranking
  reason: string;
  badge?: string;         // short mode-context tag, e.g. "this quarter" / "if selected"
  source: 'co_brand' | 'also_earns' | 'category' | 'flat_rate';
  matchMode?: MatchMode;  // only set when source === 'category'
  channel?: Channel;      // when this pick's bonus applies; omitted for flat_rate
  note?: string;
}

// Convert a rate (in either percent or points-per-dollar) into a single
// cashback-equivalent percentage so we can compare points and cashback
// cards apples-to-apples. Hilton 7x at 0.5cpp = 3.5%; Citi Double Cash
// 2% = 2.0%. Without this, the matcher would surface Hilton Aspire (7x)
// above flat 3% cards even though the cash value is lower.
function effectiveCashbackRate(rate: number, unit: 'percent' | 'points_per_dollar', cardName: string): number {
  if (unit === 'percent') return rate;
  const cpp = getValuation(cardName); // cents per point
  return rate * cpp;
}

// Map of which categories are online-only / in-store-only / both. Most
// merchant-style categories (department_stores, drugstores, wholesale_clubs)
// are merchant codes that apply at both registers and the brand's website,
// so the bonus earns either way. `online_shopping` is online by definition.
const CATEGORY_CHANNEL: Record<string, Channel> = {
  online_shopping: 'online',
  amazon: 'online',
  rakuten: 'online',
  rakuten_dining: 'online',
  travel_portal: 'online',
  hotels_portal: 'online',
  flights_portal: 'online',
  car_rentals_portal: 'online',
  hotels_car_portal: 'online',
};

function channelForCategory(categoryId: string): Channel {
  return CATEGORY_CHANNEL[categoryId] || 'both';
}

interface CardMatch {
  reward: Reward;
  matchedCategory: string;  // which of the store's categories triggered the match
  mode: MatchMode;
}

const FLAT_RATE_FLOOR = 1.5;
const MAX_PICKS = 10;

// Infer the rotation/choice mode from data shape so cards with a missing
// `mode` field still classify correctly. `current_categories` ⇒ rotating;
// `choices` ⇒ user_choice; otherwise defer to the explicit `mode` field.
function inferRewardMode(r: Reward): 'quarterly_rotating' | 'user_choice' | 'auto_top_spend' | 'direct' {
  if (r.mode === 'quarterly_rotating' || r.current_categories || r.current_period) {
    return 'quarterly_rotating';
  }
  if (r.mode === 'auto_top_spend' || r.category === 'top_category') {
    return 'auto_top_spend';
  }
  if (r.mode === 'user_choice' || typeof r.choices === 'number') {
    return 'user_choice';
  }
  return 'direct';
}

// Find the highest-value applicable reward on a card for any of the store's
// categories. Considers direct matches, current rotating bonuses, user-choice
// eligible categories, and historically-eligible rotating categories — each
// tagged with a `mode` so the caller can render an honest caveat.
//
// `includeMerchantSpecific` opts back in to category-bonuses gated by note
// (Apple Card 3% online, Costco Visa 2% wholesale_clubs). Pass `true` from
// the co-brand code path because store.co_brand_cards already establishes
// "this card earns at THIS store" — so we want to use the merchant-gated
// rate for display rather than falling back to flat 1%.
function findCategoryMatch(card: Card, categories: string[], includeMerchantSpecific = false): CardMatch | null {
  if (!card.rewards) return null;
  // Priority weight per mode: ensures a 5% direct beats a 5% rotating_eligible
  // even after they're flattened into the same picks list.
  const modeRank: Record<MatchMode, number> = {
    direct: 5,
    rotating_current: 4,
    user_choice: 3,
    top_spend: 2,
    rotating_eligible: 1,
  };
  let best: CardMatch | null = null;

  for (const r of card.rewards) {
    const inferred = inferRewardMode(r);

    // Direct: the reward's own `category` is one the store maps to AND it's
    // not actually a rotating/user-choice slot in disguise. Skip when
    // `merchant_specific` is set — those bonuses are gated by free-text
    // in `note` (e.g. Apple Card's "select Apple Pay merchants") and
    // would falsely surface for arbitrary stores in the same category.
    if (inferred === 'direct' && categories.includes(r.category) && (!r.merchant_specific || includeMerchantSpecific)) {
      const candidate: CardMatch = { reward: r, matchedCategory: r.category, mode: 'direct' };
      if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      continue;
    }

    if (inferred === 'quarterly_rotating') {
      const current = r.current_categories || [];
      const eligible = r.eligible_categories || [];
      const inCurrent = categories.find(c => current.includes(c));
      const inEligible = !inCurrent ? categories.find(c => eligible.includes(c)) : undefined;
      if (inCurrent) {
        const candidate: CardMatch = { reward: r, matchedCategory: inCurrent, mode: 'rotating_current' };
        if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      } else if (inEligible) {
        const candidate: CardMatch = { reward: r, matchedCategory: inEligible, mode: 'rotating_eligible' };
        if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      }
      continue;
    }

    if (inferred === 'auto_top_spend') {
      const eligible = r.eligible_categories || [];
      const matched = categories.find(c => eligible.includes(c));
      if (matched) {
        const candidate: CardMatch = { reward: r, matchedCategory: matched, mode: 'top_spend' };
        if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      }
      continue;
    }

    if (inferred === 'user_choice') {
      const eligible = r.eligible_categories || [];
      const matched = categories.find(c => eligible.includes(c));
      if (matched) {
        const candidate: CardMatch = { reward: r, matchedCategory: matched, mode: 'user_choice' };
        if (!best || compareMatches(candidate, best, modeRank) > 0) best = candidate;
      }
    }
  }

  return best;
}

function compareMatches(a: CardMatch, b: CardMatch, modeRank: Record<MatchMode, number>): number {
  if (a.reward.value !== b.reward.value) return a.reward.value - b.reward.value;
  return modeRank[a.mode] - modeRank[b.mode];
}

function flatRateReward(card: Card): Reward | null {
  if (!card.rewards) return null;
  return card.rewards.find(r => r.category === 'everything_else') || null;
}

function formatRate(value: number, unit: 'percent' | 'points_per_dollar'): string {
  if (unit === 'percent') return `${value}%`;
  return `${value}x points`;
}

function formatCap(reward: Reward): string {
  if (!reward.spend_cap || !reward.cap_period) return '';
  const period = reward.cap_period === 'quarterly' ? 'quarter'
    : reward.cap_period === 'monthly' ? 'month'
    : reward.cap_period === 'annual' ? 'year'
    : reward.cap_period;
  const after = reward.rate_after_cap !== undefined ? `, then ${reward.rate_after_cap}%` : '';
  return ` (up to $${reward.spend_cap.toLocaleString()}/${period}${after})`;
}

function reasonAndBadgeForMatch(match: CardMatch): { reason: string; badge: string } {
  const rateStr = formatRate(match.reward.value, match.reward.unit as 'percent' | 'points_per_dollar');
  const catLabel = labelForCategory(match.matchedCategory);
  const cap = formatCap(match.reward);
  switch (match.mode) {
    case 'direct':
      return { reason: `${rateStr} on ${catLabel}${cap}`, badge: '' };
    case 'rotating_current': {
      const period = match.reward.current_period ? ` (${match.reward.current_period})` : '';
      return {
        reason: `${rateStr} on ${catLabel} this quarter${period}${cap}. Activation required each quarter.`,
        badge: 'this quarter',
      };
    }
    case 'user_choice':
      return {
        reason: `${rateStr} on ${catLabel} if you select it as a bonus category${cap}`,
        badge: 'if you select it',
      };
    case 'top_spend':
      return {
        reason: `${rateStr} on ${catLabel} if it's your top eligible spend category that cycle${cap}`,
        badge: 'if it’s your top category',
      };
    case 'rotating_eligible':
      return {
        reason: `Up to ${rateStr} on ${catLabel} when it rotates in. Not in this quarter's lineup — check before a trip.`,
        badge: 'situational',
      };
  }
}

function rankCards(store: Store, cards: Card[]): RankedPick[] {
  const active = cards.filter(c => c.accepting_applications !== false);
  const cardsBySlug = new Map(active.map(c => [c.slug, c]));
  const used = new Set<string>();
  const picks: RankedPick[] = [];

  // 1. Co-brand
  for (const slug of store.co_brand_cards || []) {
    const card = cardsBySlug.get(slug);
    if (!card || used.has(slug)) continue;
    // Opt into merchant-gated rewards on the co-brand path. Costco Visa's
    // 2% wholesale_clubs is `merchant_specific` (so it doesn't leak onto
    // BJ's / Sam's), but for the Costco store page we WANT to show that
    // 2% rate rather than fall back to flat 1%.
    const match = findCategoryMatch(card, store.categories, true);
    const r = match?.reward || flatRateReward(card);
    const rate = r?.value ?? 0;
    const unit = (r?.unit as 'percent' | 'points_per_dollar') ?? 'percent';
    picks.push({
      card,
      rate,
      unit,
      effectiveRate: effectiveCashbackRate(rate, unit, card.card_name),
      reason: `Co-branded ${store.name} card`,
      source: 'co_brand',
      channel: 'both',  // co-brand cards earn at the brand both in-store and online
      note: r?.note,
    });
    used.add(slug);
  }

  // 2. Build the rate-ranked group: merchant-specific overrides (also_earns)
  //    + category bonuses (direct / rotating_current / user_choice /
  //    rotating_eligible) compete in the same list, sorted by effective
  //    rate. Previously also_earns lived in its own tier above category
  //    matches, which meant a 5% also_earns would outrank a 6% direct
  //    grocery match (e.g. Amazon Prime Visa at Whole Foods vs. Blue Cash
  //    Preferred). Sorting them together is the honest answer at-a-glance.
  type RankedCandidate =
    | { kind: 'also_earns'; card: Card; rate: number; unit: 'percent' | 'points_per_dollar'; note?: string; effective: number }
    | { kind: 'category'; card: Card; match: CardMatch; effective: number };
  const candidates: RankedCandidate[] = [];

  for (const entry of store.also_earns || []) {
    const card = cardsBySlug.get(entry.card);
    if (!card || used.has(entry.card)) continue;
    const eff = effectiveCashbackRate(entry.rate, entry.unit, card.card_name);
    candidates.push({
      kind: 'also_earns',
      card,
      rate: entry.rate,
      unit: entry.unit,
      note: entry.note,
      effective: eff,
    });
  }

  for (const card of active) {
    if (used.has(card.slug)) continue;
    if (candidates.some(c => c.card.slug === card.slug)) continue; // already an also_earns pick
    const m = findCategoryMatch(card, store.categories);
    if (!m) continue;
    const eff = effectiveCashbackRate(
      m.reward.value,
      m.reward.unit as 'percent' | 'points_per_dollar',
      card.card_name,
    );
    // Skip anything below the flat-rate floor on a cashback-equivalent
    // basis. Hilton 1x at "everything else" = 0.5% effective — below floor.
    if (eff <= FLAT_RATE_FLOOR) continue;
    // rotating_eligible is "you might earn this in some quarter" — penalize
    // so it lists under everything that's actually current/choosable.
    const effective = m.mode === 'rotating_eligible' ? eff - 100 : eff;
    candidates.push({ kind: 'category', card, match: m, effective });
  }

  candidates.sort((a, b) => b.effective - a.effective);

  for (const c of candidates) {
    if (c.kind === 'also_earns') {
      picks.push({
        card: c.card,
        rate: c.rate,
        unit: c.unit,
        effectiveRate: effectiveCashbackRate(c.rate, c.unit, c.card.card_name),
        reason: `Earns ${formatRate(c.rate, c.unit)} at ${store.name}`,
        source: 'also_earns',
        channel: 'both',
        note: c.note,
      });
    } else {
      const { reason, badge } = reasonAndBadgeForMatch(c.match);
      picks.push({
        card: c.card,
        rate: c.match.reward.value,
        unit: c.match.reward.unit as 'percent' | 'points_per_dollar',
        effectiveRate: effectiveCashbackRate(
          c.match.reward.value,
          c.match.reward.unit as 'percent' | 'points_per_dollar',
          c.card.card_name,
        ),
        reason,
        badge: badge || undefined,
        channel: channelForCategory(c.match.matchedCategory),
        source: 'category',
        matchMode: c.match.mode,
        note: c.match.reward.note,
      });
    }
    used.add(c.card.slug);
  }

  // 4. Flat-rate fallback to fill the list out to MAX_PICKS. Always runs
  //    so a store with only 1-2 category matches still shows a useful
  //    top-10. Floor at 2% so we don't list every 1% card on the planet.
  if (picks.length < MAX_PICKS) {
    const flatPicks: { card: Card; reward: Reward }[] = [];
    for (const card of active) {
      if (used.has(card.slug)) continue;
      const reward = flatRateReward(card);
      if (reward && reward.unit === 'percent' && reward.value >= 2) {
        flatPicks.push({ card, reward });
      }
    }
    flatPicks.sort((a, b) => b.reward.value - a.reward.value);
    for (const { card, reward } of flatPicks.slice(0, MAX_PICKS - picks.length)) {
      picks.push({
        card,
        rate: reward.value,
        unit: reward.unit as 'percent',
        effectiveRate: reward.value, // already a cashback %
        reason: `${formatRate(reward.value, 'percent')} flat-rate cashback`,
        source: 'flat_rate',
        note: reward.note,
      });
      used.add(card.slug);
    }
  }

  return picks.slice(0, MAX_PICKS);
}

const CATEGORY_LABELS: Record<string, string> = {
  department_stores: 'department stores',
  online_shopping: 'online shopping',
  groceries: 'groceries',
  dining: 'dining',
  gas: 'gas',
  travel: 'travel',
  everything_else: 'everything else',
  home_improvement: 'home improvement',
  drugstores: 'drugstores',
  wholesale_clubs: 'wholesale clubs',
};

// Tag form: shorter, title-cased, singular where natural
// (e.g. "Department Store" instead of "department stores").
const CATEGORY_TAG_LABELS: Record<string, string> = {
  department_stores: 'Department Store',
  online_shopping: 'Online Shopping',
  groceries: 'Groceries',
  dining: 'Dining',
  gas: 'Gas',
  travel: 'Travel',
  home_improvement: 'Home Improvement',
  drugstores: 'Drugstore',
  wholesale_clubs: 'Wholesale Club',
};

function labelForCategory(id: string): string {
  return CATEGORY_LABELS[id] || id.replace(/_/g, ' ');
}

function tagLabelForCategory(id: string): string {
  return CATEGORY_TAG_LABELS[id]
    || id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default async function BestCardForStorePage({ params }: PageProps) {
  const { slug } = await params;
  const [store, allCards] = await Promise.all([getStore(slug), getAllCards()]);
  if (!store) notFound();

  const picks = rankCards(store, allCards);
  const usingFallback = picks.length > 0 && picks.every(p => p.source === 'flat_rate');

  return (
    <div className="landing-v2 store-v2">
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: `Best Credit Card for ${store.name}`, url: `https://creditodds.com/best-card-for/${store.slug}` },
        ]}
      />
      {store.faq && store.faq.length > 0 && (
        <FAQSchema questions={store.faq.map(f => ({ question: f.q, answer: f.a }))} />
      )}

      <section className="page-hero wrap">
        <Link href="/best-card-for" className="store-back-link">
          ← All stores
        </Link>
        <h1 className="page-title">
          Best credit card to use at {store.name}<em>.</em>
        </h1>
        {store.categories.length > 0 && (
          <div className="store-tag-row">
            {store.categories.map(c => (
              <span key={c} className="store-tag">{tagLabelForCategory(c)}</span>
            ))}
          </div>
        )}
        <p className="page-sub">
          {store.intro.split('\n\n')[0]}
        </p>
      </section>

      <div className="wrap store-body">
        {usingFallback && (
          <div className="store-banner">
            <b>Honest answer:</b> no card we track gives a category bonus on{' '}
            {store.categories.map(labelForCategory).join(' or ')} purchases. Your best
            move is a strong flat-rate cashback card — these are the ones we'd pick.
          </div>
        )}

        {picks.length === 0 ? (
          <p className="store-empty">
            We don't have a strong recommendation for {store.name} yet. Check back as we
            add more cards.
          </p>
        ) : (
          <>
          {picks.some(p => p.channel === 'online' || p.channel === 'in_store') && (
            <p className="store-channel-note">
              Picks without a tag earn at {store.name} both in-store and online. Watch for the
              <span className="store-pick-channel is-online" style={{ margin: '0 4px' }}>Online only</span>
              tag — those bonuses only apply on {store.website ? new URL(store.website).hostname.replace(/^www\./, '') : `${store.name}'s site`}.
            </p>
          )}
          <ol className="store-picks">
            {picks.map((pick, i) => (
              <li key={pick.card.slug} className="store-pick">
                <div className="store-pick-rank">#{i + 1}</div>
                <Link
                  href={`/card/${pick.card.slug}`}
                  className="store-pick-image"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  <CardImage
                    cardImageLink={pick.card.card_image_link}
                    alt=""
                    width={64}
                    height={40}
                    style={{ width: 64, height: 40, objectFit: 'contain' }}
                  />
                </Link>
                <div className="store-pick-body">
                  <div className="store-pick-name-row">
                    <Link href={`/card/${pick.card.slug}`} className="store-pick-name">
                      {pick.card.card_name}
                    </Link>
                    {pick.channel === 'online' && (
                      <span className="store-pick-channel is-online" aria-label="Online purchases only">
                        Online only
                      </span>
                    )}
                    {pick.channel === 'in_store' && (
                      <span className="store-pick-channel is-instore" aria-label="In-store purchases only">
                        In-store only
                      </span>
                    )}
                    {pick.badge && (() => {
                      // Three flavors:
                      //   - rotating_current → "THIS QUARTER" — informational
                      //     (bonus is live now). Purple/accent + calendar icon.
                      //   - rotating_eligible → "SITUATIONAL" — past quarters
                      //     only. Muted gray.
                      //   - user_choice / top_spend → real condition the
                      //     cardholder must meet (opt-in, top-spend dependency).
                      //     Amber + warning triangle.
                      const isPeriod = pick.matchMode === 'rotating_current';
                      const isSituational = pick.matchMode === 'rotating_eligible';
                      const cls = isPeriod ? ' is-period' : isSituational ? ' is-situational' : '';
                      const Icon = isPeriod ? CalendarDaysIcon : ExclamationTriangleIcon;
                      return (
                        <span className={`store-pick-badge${cls}`}>
                          <Icon className="store-pick-badge-icon" aria-hidden="true" />
                          {pick.badge}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="store-pick-bank">{pick.card.bank}</div>
                  <div className="store-pick-reason">{pick.reason}</div>
                  {pick.note && <div className="store-pick-note">{pick.note}</div>}
                </div>
                <div
                  className={`store-pick-rate${pick.source === 'co_brand' ? ' is-cobrand' : ''}`}
                >
                  {pick.unit === 'points_per_dollar' ? (
                    <>
                      <span className="store-pick-rate-primary">
                        {pick.effectiveRate.toFixed(pick.effectiveRate < 10 ? 1 : 0)}%
                      </span>
                      <span className="store-pick-rate-secondary">
                        {formatRate(pick.rate, pick.unit)}
                      </span>
                    </>
                  ) : (
                    <span className="store-pick-rate-primary">
                      {formatRate(pick.rate, pick.unit)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
          </>
        )}

        {store.intro.split('\n\n').slice(1).map((para, i) => (
          <p key={i} className="store-paragraph">
            {para}
          </p>
        ))}

        {store.faq && store.faq.length > 0 && (
          <section className="store-faq">
            <h2 className="store-faq-title">Frequently asked</h2>
            <div className="store-faq-list">
              {store.faq.map((f, i) => (
                <div key={i} className="store-faq-item">
                  <div className="store-faq-q">{f.q}</div>
                  <div className="store-faq-a">{f.a}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="store-meta">
          <a
            href={`https://github.com/CreditOdds/creditodds/edit/main/data/stores/${store.slug}.yaml`}
            target="_blank"
            rel="noopener noreferrer"
            className="store-meta-link"
          >
            <PencilSquareIcon className="store-meta-icon" />
            Edit this page
          </a>
          <a
            href={
              `https://github.com/CreditOdds/creditodds/issues/new?` +
              new URLSearchParams({
                title: `[${store.name}] Issue with /best-card-for/${store.slug}`,
                labels: 'stores',
                body:
                  `**Page:** https://creditodds.com/best-card-for/${store.slug}\n` +
                  `**Store YAML:** [\`data/stores/${store.slug}.yaml\`](https://github.com/CreditOdds/creditodds/blob/main/data/stores/${store.slug}.yaml)\n\n` +
                  `### What's the issue?\n` +
                  `<!-- e.g. wrong category, missing co-brand card, miscategorized merchant, ranking that doesn't match real-world rates, etc. -->\n\n` +
                  `### What would correct look like?\n` +
                  `<!-- describe the correction or share a source -->\n`,
              }).toString()
            }
            target="_blank"
            rel="noopener noreferrer"
            className="store-meta-link"
          >
            <ExclamationTriangleIcon className="store-meta-icon" />
            Report an issue
          </a>
        </div>
      </div>
      <V2Footer />
    </div>
  );
}
