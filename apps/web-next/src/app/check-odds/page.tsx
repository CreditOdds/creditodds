import { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import CheckOddsClient from "./CheckOddsClient";

export const metadata: Metadata = {
  title: "Check Your Odds",
  description: "Enter your credit profile and see how you compare against approved applicants for every credit card. Find out which cards you're most likely to be approved for.",
  openGraph: {
    title: "Check Your Odds | CreditOdds",
    description: "See your approval chances across all credit cards based on your credit profile.",
  },
};

export default function CheckOddsPage() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://creditodds.com' },
        { name: 'Check Your Odds', url: 'https://creditodds.com/check-odds' }
      ]} />

      <nav className="bg-white border-b border-gray-200" aria-label="Breadcrumb">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ol className="flex items-center space-x-4 py-4">
            <li>
              <Link href="/" className="text-gray-400 hover:text-gray-500">
                Home
              </Link>
            </li>
            <li>
              <div className="flex items-center">
                <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
                </svg>
                <span className="ml-4 text-sm font-medium text-gray-500">Check Your Odds</span>
              </div>
            </li>
          </ol>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <Suspense>
          <CheckOddsClient />
        </Suspense>
      </div>
    </div>
  );
}
