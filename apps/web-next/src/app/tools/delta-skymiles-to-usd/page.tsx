import { Metadata } from 'next';
import Link from 'next/link';
import CardImage from '@/components/ui/CardImage';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import { getAllCards } from '@/lib/api';
import { getNews } from '@/lib/news';
import ConverterClient from './ConverterClient';
import PaginatedNewsList from '@/components/tools/PaginatedNewsList';
import { V2Footer } from '@/components/landing-v2/Chrome';
import '../../landing.css';

export const metadata: Metadata = {
  title: 'Delta SkyMiles to USD (Converter/Calculator) | CreditOdds',
  description: 'Convert Delta SkyMiles to their estimated USD value. Free calculator using the standard 1.1 cents per mile valuation.',
};

export default async function DeltaSkyMilesToUsdPage() {
  const [allCards, allNews] = await Promise.all([getAllCards(), getNews()]);

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
          <span>Tools · converter</span>
        </div>
        <h1 className="page-title">
          Delta SkyMiles to USD Converter.
        </h1>
        <p className="page-sub">
          Estimate the dollar value of your Delta SkyMiles.
        </p>
      </section>

      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 64 }}>
        <ConverterClient />

        {cards.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-semibold text-gray-900">Delta Credit Cards</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        <PaginatedNewsList news={news} heading="Delta News" />
      </div>
      <V2Footer />
    </div>
  );
}
