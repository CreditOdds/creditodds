import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllStores, getStore } from "@/lib/stores";
import { getAllCards } from "@/lib/api";
import { rankCards, formatRate, labelForCategory } from "@/lib/storeRanking";
import { BreadcrumbSchema, FAQSchema } from "@/components/seo/JsonLd";
import CardImage from "@/components/ui/CardImage";
import { V2Footer } from "@/components/landing-v2/Chrome";
import { PencilSquareIcon, ExclamationTriangleIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import StorePersonalRow from "./StorePersonalRow";
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

// Ranking machinery (rankCards, findCategoryMatch, channel maps, etc.) lives in
// `lib/storeRanking.ts` so the per-wallet client component can share it.


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

      {/* Terminal strip — dark bar with breadcrumb + pick count, matching
          /card and /profile so the editorial chrome is consistent. */}
      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <Link href="/best-card-for" className="cj-crumb">Stores</Link>
          <span className="cj-sep">/</span>
          <span className="cj-crumb cj-crumb-current" aria-current="page">{store.name}</span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span>
            <span className="cj-status-dot" />
            {picks.length} {picks.length === 1 ? 'card' : 'cards'} ranked
          </span>
        </div>
      </div>

      <section className="page-hero wrap">
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
          <StorePersonalRow store={store} />
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
                    alt={pick.card.card_name}
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
