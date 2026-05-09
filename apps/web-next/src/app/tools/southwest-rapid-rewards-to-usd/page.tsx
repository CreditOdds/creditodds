import { Metadata } from 'next';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import { getAllCards } from '@/lib/api';
import { getNews } from '@/lib/news';
import ConverterClient from './ConverterClient';
import PaginatedNewsList from '@/components/tools/PaginatedNewsList';
import ToolBreadcrumb from '@/components/tools/ToolBreadcrumb';
import ValuationChart from '@/components/tools/ValuationChart';
import { loadValuation } from '@/lib/valuationData';
import { V2Footer } from '@/components/landing-v2/Chrome';
import '../../landing.css';

export const metadata: Metadata = {
  title: 'Southwest Rapid Rewards to USD Calculator',
  description: 'Convert Southwest Rapid Rewards points to their estimated USD value. Free calculator using the multi-source 1.30 cents per point median valuation.',
  openGraph: {
    title: 'Southwest Rapid Rewards to USD | CreditOdds',
    description: 'Convert Southwest Rapid Rewards points to USD using the multi-source 1.30 cents per point median valuation.',
    url: 'https://creditodds.com/tools/southwest-rapid-rewards-to-usd',
    type: 'website',
  },
  alternates: { canonical: 'https://creditodds.com/tools/southwest-rapid-rewards-to-usd' },
};

export default async function SouthwestRRToUsdPage() {
  const [allCards, allNews] = await Promise.all([getAllCards(), getNews()]);
  const valuation = loadValuation('southwest-rapid-rewards');

  const cards = allCards.filter(c =>
    c.card_name.toLowerCase().includes('southwest') && c.accepting_applications
  );
  const news = allNews.filter(n => {
    const text = `${n.title} ${n.summary}`.toLowerCase();
    return text.includes('southwest') || text.includes('rapid rewards');
  });

  return (
    <div className="landing-v2 tools-v2">
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: 'Tools', url: 'https://creditodds.com/tools' },
        { name: 'Southwest Rapid Rewards to USD', url: 'https://creditodds.com/tools/southwest-rapid-rewards-to-usd' },
      ]} />

      <ToolBreadcrumb toolName="Southwest Rapid Rewards to USD" toolSlug="southwest-rapid-rewards-to-usd" />

      <section className="page-hero wrap">
        <h1 className="page-title">
          Southwest Rapid Rewards to USD Converter.
        </h1>
        <p className="page-sub">
          Estimate the dollar value of your Southwest Rapid Rewards points.
        </p>
      </section>

      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 64 }}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div>
            <ConverterClient />

            {cards.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-semibold text-gray-900">Southwest Credit Cards</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {cards.map(card => (
                    <Link
                      key={card.slug}
                      href={`/card/${card.slug}`}
                      className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow flex items-center gap-4 group"
                    >
                      <div className="h-10 w-16 flex-shrink-0 relative">
                        <CardImage
                          cardImageLink={card.card_image_link}
                          alt={card.card_name}
                          fill
                          className="object-contain"
                          sizes="64px"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-indigo-600 group-hover:text-indigo-900 truncate">{card.card_name}</p>
                        <p className="text-xs text-gray-500">{card.bank}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {valuation && (
            <ValuationChart
              programName={valuation.program}
              unit={valuation.unit}
              dataPoints={valuation.data_points}
            />
          )}
        </div>

        <PaginatedNewsList news={news} heading="Southwest News" />
      </div>
      <V2Footer />
    </div>
  );
}
