import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import CardImage from '@/components/ui/CardImage';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import { getAllCards } from '@/lib/api';
import { getNews } from '@/lib/news';
import ConverterClient from './ConverterClient';
import PaginatedNewsList from '@/components/tools/PaginatedNewsList';

export const metadata: Metadata = {
  title: 'Bilt Rewards Points to USD (Converter/Calculator) | CreditOdds',
  description: 'Convert Bilt Rewards points to their estimated USD value. Free calculator using the standard 1.5 cents per point valuation.',
};

export default async function BiltToUsdPage() {
  const [allCards, allNews] = await Promise.all([getAllCards(), getNews()]);

  const cards = allCards.filter(c =>
    c.card_name.toLowerCase().includes('bilt') && c.accepting_applications
  );
  const news = allNews.filter(n => {
    const text = `${n.title} ${n.summary}`.toLowerCase();
    return text.includes('bilt');
  });

  return (
    <div className="bg-gray-50 min-h-screen">
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: 'Tools', url: 'https://creditodds.com/tools' },
        { name: 'Bilt Rewards Points to USD', url: 'https://creditodds.com/tools/bilt-rewards-points-to-usd' },
      ]} />

      <nav className="bg-white border-b border-gray-200" aria-label="Breadcrumb">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ol className="flex items-center space-x-4 py-4 overflow-hidden">
            <li>
              <Link href="/" className="text-gray-400 hover:text-gray-500">Home</Link>
            </li>
            <li>
              <div className="flex items-center">
                <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
                </svg>
                <Link href="/tools" className="ml-4 text-sm font-medium text-gray-400 hover:text-gray-500">Tools</Link>
              </div>
            </li>
            <li>
              <div className="flex items-center">
                <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
                </svg>
                <span className="ml-4 text-sm font-medium text-gray-500 truncate">Bilt Rewards Points to USD</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3">
          <Image src="/logos/bilt.jpg" alt="Bilt" width={32} height={32} className="rounded-md" />
          <h1 className="text-2xl font-bold text-gray-900">Bilt Rewards Points to USD Converter</h1>
        </div>
        <p className="mt-2 text-gray-600">
          Estimate the dollar value of your Bilt Rewards points.
        </p>

        <ConverterClient />

        {cards.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-semibold text-gray-900">Bilt Credit Cards</h2>
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

        <PaginatedNewsList news={news} heading="Bilt News" />
      </div>
    </div>
  );
}
