'use client';

import {
  GiftIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { CardBenefit } from "@/lib/api";
import { formatBenefitValue, isMonetaryBenefit } from "@/lib/cardDisplayUtils";

const frequencyLabels: Record<string, string> = {
  monthly: "/mo",
  quarterly: "/qtr",
  semi_annual: "/6 mo",
  annual: "/yr",
  multi_year: "every 4 yr",
  ongoing: "",
};

const categoryIcons: Record<string, string> = {
  dining: "🍽️",
  dining_travel: "🚗",
  travel: "✈️",
  hotel: "🏨",
  entertainment: "🎬",
  shopping: "🛍️",
  fitness: "💪",
  lounge: "🛋️",
  security: "🔒",
  gas: "⛽",
  streaming: "📺",
  grocery: "🛒",
  rideshare: "🚗",
  car_rental: "🚙",
  other: "✨",
};

interface CardBenefitsProps {
  benefits: CardBenefit[];
  cardName: string;
}

export default function CardBenefits({ benefits, cardName }: CardBenefitsProps) {
  const credits = benefits.filter((b) => b.value > 0);
  const perks = benefits.filter((b) => b.value === 0);
  // Only sum USD-valued credits — points/miles can't be meaningfully added in dollars.
  const totalAnnualValue = credits.reduce((sum, b) => {
    if (!isMonetaryBenefit(b)) return sum;
    if (b.frequency === "multi_year") return sum + Math.round(b.value / 4);
    return sum + b.value;
  }, 0);

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-[0_4px_40px_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="p-6 sm:p-10 border-b border-gray-100 bg-gradient-to-br from-emerald-50/70 to-white">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-emerald-600">
                  Card benefits
                </h2>
                <p className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">
                  Credits &amp; Perks
                </p>
                <p className="mt-2 text-sm sm:text-base text-gray-600">
                  Annual statement credits and benefits included with the {cardName}.
                </p>
              </div>
              <div className="mt-4 sm:mt-0 flex-shrink-0 text-center sm:text-right">
                <p className="text-sm font-semibold text-emerald-600">
                  Total annual credits
                </p>
                <p className="text-3xl sm:text-4xl font-extrabold text-emerald-700 mt-1">
                  ${totalAnnualValue.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            {/* Statement Credits */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {credits.map((benefit) => (
                <div
                  key={benefit.name}
                  className="group relative rounded-xl border border-gray-200 bg-gray-50/50 p-5 hover:border-emerald-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl" role="img" aria-label={benefit.category}>
                        {categoryIcons[benefit.category] || categoryIcons.other}
                      </span>
                      <h3 className="text-sm font-semibold text-gray-900 leading-tight">
                        {benefit.name}
                      </h3>
                    </div>
                    {benefit.enrollment_required && (
                      <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
                        Enroll
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-2xl font-bold text-emerald-700">
                      {formatBenefitValue(benefit)}
                    </span>
                    <span className="text-sm text-gray-400 font-medium">
                      {frequencyLabels[benefit.frequency]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {benefit.description}
                  </p>
                </div>
              ))}
            </div>

            {/* Non-monetary Perks */}
            {perks.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-4">
                  <GiftIcon className="h-5 w-5 text-indigo-500" />
                  <h3 className="text-base font-semibold text-gray-700">
                    Additional perks
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {perks.map((perk) => (
                    <div
                      key={perk.name}
                      className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3"
                    >
                      <CheckCircleIcon className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {perk.name}
                        </p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {perk.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
