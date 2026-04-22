import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCardsByBank, getAllBanks, getCardViewCounts } from "@/lib/api";
import { NewspaperIcon } from "@heroicons/react/24/outline";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import { getNews, tagLabels } from "@/lib/news";
import BankCardsTable from "./BankCardsTable";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../../landing.css";

interface BankPageProps {
  params: Promise<{ name: string }>;
}

export async function generateStaticParams() {
  try {
    const banks = await getAllBanks();
    return banks.map((bank) => ({ name: bank }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: BankPageProps): Promise<Metadata> {
  const { name } = await params;
  const bankName = decodeURIComponent(name);
  return {
    title: `${bankName} Credit Cards`,
    description: `View all ${bankName} credit cards and their approval odds. Compare credit scores, income requirements, and approval rates.`,
    openGraph: {
      title: `${bankName} Credit Cards | CreditOdds`,
      description: `See approval odds for all ${bankName} credit cards.`,
      url: `https://creditodds.com/bank/${encodeURIComponent(bankName)}`,
      type: "website",
    },
  };
}

function stripEmoji(label: string): string {
  return label.replace(/^[^\w]+\s*/, '');
}

export default async function BankPage({ params }: BankPageProps) {
  const { name } = await params;
  const bankName = decodeURIComponent(name);

  const [cards, allNews, trendingViews] = await Promise.all([
    getCardsByBank(bankName),
    getNews(),
    getCardViewCounts('trending').catch(() => ({})),
  ]);

  if (cards.length === 0) notFound();

  const bankNews = allNews.filter(news => news.bank === bankName);
  const activeCount = cards.filter(c => c.accepting_applications !== false).length;

  return (
    <div className="landing-v2 bank-v2">
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: bankName, url: `https://creditodds.com/bank/${encodeURIComponent(bankName)}` },
        ]}
      />

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
          <span>Issuer · {cards.length} card{cards.length === 1 ? '' : 's'}</span>
        </div>
        <h1 className="page-title">
          {bankName}
          <em>.</em>
        </h1>
        <p className="page-sub">
          Every {bankName} card we track — with live approval data, welcome bonuses,
          rewards, and recent news.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            marginTop: 14,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11.5,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          <span>
            <b style={{ color: 'var(--ink)' }}>{activeCount}</b> active
          </span>
          <span>·</span>
          <span>
            <b style={{ color: 'var(--ink)' }}>{cards.length - activeCount}</b> archived
          </span>
          <span>·</span>
          <span>
            <b style={{ color: 'var(--ink)' }}>{bankNews.length}</b> news
          </span>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 64 }}>
        <BankCardsTable cards={cards} trendingViews={trendingViews} />

        <div className="mt-8 bg-white sm:shadow sm:ring-1 sm:ring-black sm:ring-opacity-5 sm:rounded-lg overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <NewspaperIcon className="h-5 w-5 text-indigo-600" />
              <h2 className="text-base font-semibold text-gray-900">{bankName} news</h2>
            </div>
          </div>
          {bankNews.length > 0 ? (
            <ul className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
              {bankNews.slice(0, 10).map((news) => (
                <li key={news.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs text-gray-400"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {new Date(news.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {news.tags.slice(0, 1).map((tag) => (
                      <span
                        key={tag}
                        style={{
                          display: 'inline-flex',
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: 'var(--accent-2)',
                          color: 'var(--accent)',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10.5,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                        }}
                      >
                        {stripEmoji(tagLabels[tag])}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm font-medium text-gray-900 line-clamp-2">
                    {news.body ? (
                      <Link href={`/news/${news.id}`} className="hover:text-indigo-600 transition-colors">
                        {news.title}
                      </Link>
                    ) : (
                      news.title
                    )}
                  </p>
                  {news.card_slugs && news.card_names && news.card_slugs.length > 0 && (
                    <div className="mt-1 text-xs">
                      {news.card_slugs.map((s, i) => (
                        <span key={s}>
                          {i > 0 && <span className="text-gray-400">, </span>}
                          <Link href={`/card/${s}`} className="text-indigo-600 hover:text-indigo-900">
                            {news.card_names![i]}
                          </Link>
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center">
              <NewspaperIcon className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">No {bankName} news yet</p>
            </div>
          )}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
            <Link href="/news" className="text-sm text-indigo-600 hover:text-indigo-900">
              View all card news →
            </Link>
          </div>
        </div>
      </div>
      <V2Footer />
    </div>
  );
}
