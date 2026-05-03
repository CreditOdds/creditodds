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
  title: 'Marriott Bonvoy Points to USD (Converter/Calculator) | CreditOdds',
  description: 'Convert Marriott Bonvoy points to their estimated USD value. Free calculator using the standard 0.7 cents per point valuation.',
  openGraph: {
    title: 'Marriott Bonvoy Points to USD | CreditOdds',
    description: 'Convert Marriott Bonvoy points to USD using the 0.7 cents per point valuation.',
    url: 'https://creditodds.com/tools/marriott-bonvoy-points-to-usd',
    type: 'website',
  },
  alternates: { canonical: 'https://creditodds.com/tools/marriott-bonvoy-points-to-usd' },
};

export default async function MarriottBonvoyToUsdPage() {
  const [allCards, allNews] = await Promise.all([getAllCards(), getNews()]);

  const cards = allCards.filter(c => {
    const name = c.card_name.toLowerCase();
    return (name.includes('marriott') || name.includes('bonvoy')) && c.accepting_applications;
  });
  const news = allNews.filter(n => {
    const text = `${n.title} ${n.summary}`.toLowerCase();
    return text.includes('marriott') || text.includes('bonvoy');
  });

  return (
    <div className="landing-v2 tools-v2">
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: 'Tools', url: 'https://creditodds.com/tools' },
        { name: 'Marriott Bonvoy Points to USD', url: 'https://creditodds.com/tools/marriott-bonvoy-points-to-usd' },
      ]} />

      <section className="page-hero wrap">
        <h1 className="page-title">
          Marriott Bonvoy Points to USD Converter.
        </h1>
        <p className="page-sub">
          Estimate the dollar value of your Marriott Bonvoy points.
        </p>
      </section>

      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 64 }}>
        <ConverterClient />

        {cards.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-semibold text-gray-900">Marriott Credit Cards</h2>
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

        <PaginatedNewsList news={news} heading="Marriott News" />
      </div>
      <V2Footer />
    </div>
  );
}
