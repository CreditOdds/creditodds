import { Metadata } from 'next';
import Link from 'next/link';
import { BreadcrumbSchema } from '@/components/seo/JsonLd';
import ConverterClient from './ConverterClient';

export const metadata: Metadata = {
  title: 'Delta SkyMiles to USD (Converter/Calculator) | CreditOdds',
  description: 'Convert Delta SkyMiles to their estimated USD value. Free calculator using the standard 1.1 cents per mile valuation.',
};

export default function DeltaSkyMilesToUsdPage() {
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
      </div>
    </div>
  );
}
