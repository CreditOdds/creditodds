import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import { getAllCards } from '@/lib/api';
import { getNews } from '@/lib/news';
import ConverterClient from './ConverterClient';

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
    <div className="bg-gray-50 min-h-screen">
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: 'Tools', url: 'https://creditodds.com/tools' },
        { name: 'Delta SkyMiles to USD', url: 'https://creditodds.com/tools/delta-skymiles-to-usd' },
      ]} />

      <nav className="bg-white border-b border-gray-200" aria-label="Breadcrumb">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ol className="flex items-center space-x-4 py-4">
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
                <span className="ml-4 text-sm font-medium text-gray-500">Delta SkyMiles to USD</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Delta SkyMiles to USD Converter</h1>
        <p className="mt-2 text-gray-600">
          Estimate the dollar value of your Delta SkyMiles.
        </p>

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
                    <Image
                      src={card.card_image_link
                        ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                        : '/assets/generic-card.svg'}
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

        {news.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-semibold text-gray-900">Delta News</h2>
            <div className="mt-4 space-y-3">
              {news.map(item => (
                <div key={item.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500">
                        {new Date(item.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {item.body ? (
                          <Link href={`/news/${item.id}`} className="hover:text-indigo-600 transition-colors">
                            {item.title}
                          </Link>
                        ) : (
                          item.title
                        )}
                      </p>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.summary}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
