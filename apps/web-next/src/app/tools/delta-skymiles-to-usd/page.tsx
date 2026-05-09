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
  title: 'Delta SkyMiles to USD Calculator',
  description: 'Convert Delta SkyMiles to their estimated USD value. Free calculator using the multi-source 1.20 cents per mile median valuation.',
  openGraph: {
    title: 'Delta SkyMiles to USD | CreditOdds',
    description: 'Convert Delta SkyMiles to USD using the multi-source 1.20 cents per mile median valuation.',
    url: 'https://creditodds.com/tools/delta-skymiles-to-usd',
    type: 'website',
  },
  alternates: { canonical: 'https://creditodds.com/tools/delta-skymiles-to-usd' },
};

export default async function DeltaSkyMilesToUsdPage() {
  const [allCards, allNews] = await Promise.all([getAllCards(), getNews()]);
  const valuation = loadValuation('delta-skymiles');

  const cards = allCards.filter(c =>
    c.card_name.toLowerCase().includes('delta') && c.accepting_applications
  );
  const news = allNews.filter(n =>
    n.title.toLowerCase().includes('delta') ||
    n.summary.toLowerCase().includes('delta')
  );

  return (
    <div className="landing-v2 tools-v2">
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: 'Tools', url: 'https://creditodds.com/tools' },
        { name: 'Delta SkyMiles to USD', url: 'https://creditodds.com/tools/delta-skymiles-to-usd' },
      ]} />

      <ToolBreadcrumb toolName="Delta SkyMiles to USD" toolSlug="delta-skymiles-to-usd" />

      <section className="page-hero wrap">
        <h1 className="page-title">
          Delta SkyMiles to USD Converter.
        </h1>
        <p className="page-sub">
          Estimate the dollar value of your Delta SkyMiles.
        </p>
      </section>

      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 64 }}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div>
            <ConverterClient />

            {cards.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-semibold text-gray-900">Delta Credit Cards</h2>
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

        <PaginatedNewsList news={news} heading="Delta News" />
      </div>
      <V2Footer />
    </div>
  );
}
