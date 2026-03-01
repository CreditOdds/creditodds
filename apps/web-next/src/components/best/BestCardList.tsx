import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@/lib/api';
import { BestPageCard } from '@/lib/best';
import { ApplyButtons } from './ApplyButtons';
import {
  getCentsPerPoint,
  formatEstimatedValue,
  formatBonusValue,
  formatBonusRequirement,
  formatAnnualFee,
  RewardTypeBadge,
} from '@/lib/cardDisplayUtils';

interface EnrichedCard extends BestPageCard {
  card: Card;
}

interface BestCardListProps {
  cards: EnrichedCard[];
}

export function BestCardList({ cards }: BestCardListProps) {
  return (
    <div className="space-y-6">
      {cards.map((entry, index) => {
        const { card } = entry;
        const rank = index + 1;
        const topRewards = (card.rewards || []).slice(0, 3);

        return (
          <div
            key={card.slug}
            className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
          >
            {/* Header with rank and badge */}
            <div className="flex items-center gap-3 px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-200">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold flex-shrink-0">
                {rank}
              </span>
              <Link href={`/card/${card.slug}`} className="text-lg font-bold text-gray-900 hover:text-indigo-600 transition-colors">
                {card.card_name}
              </Link>
              {entry.badge && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 whitespace-nowrap">
                  {entry.badge}
                </span>
              )}
            </div>

            <div className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                {/* Card image */}
                <div className="flex-shrink-0">
                  <Link href={`/card/${card.slug}`}>
                    {card.card_image_link ? (
                      <Image
                        src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`}
                        alt={card.card_name}
                        width={160}
                        height={100}
                        className="rounded-lg shadow-sm"
                      />
                    ) : (
                      <div className="w-40 h-25 bg-gray-200 rounded-lg flex items-center justify-center">
                        <span className="text-gray-400 text-xs">No image</span>
                      </div>
                    )}
                  </Link>
                </div>

                {/* Card details */}
                <div className="flex-1 min-w-0">
                  {/* Bank + badges row */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-sm text-gray-500">{card.bank}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {formatAnnualFee(card.annual_fee)} / yr
                    </span>
                    <RewardTypeBadge type={card.reward_type} />
                  </div>

                  {/* Signup bonus */}
                  {card.signup_bonus && (
                    <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 mb-3">
                      <p className="text-sm font-medium text-amber-900">
                        Earn{' '}
                        <span className="font-bold text-base">{formatBonusValue(card)}</span>
                        {formatEstimatedValue(card) && (
                          <span className="text-amber-700 font-normal"> ({formatEstimatedValue(card)} est. value)</span>
                        )}
                        {' '}{formatBonusRequirement(card)}
                      </p>
                    </div>
                  )}

                  {/* Intro APR */}
                  {!card.signup_bonus && card.apr && (card.apr.purchase_intro || card.apr.balance_transfer_intro) && (
                    <div className="bg-sky-50 border border-sky-100 rounded-lg px-4 py-3 mb-3">
                      <p className="text-sm font-medium text-sky-900">
                        {card.apr.purchase_intro && card.apr.balance_transfer_intro ? (
                          <>
                            <span className="font-bold text-base">{card.apr.purchase_intro.rate}% intro APR</span> for {card.apr.purchase_intro.months} months on purchases
                            {card.apr.balance_transfer_intro.months !== card.apr.purchase_intro.months ? (
                              <> &amp; {card.apr.balance_transfer_intro.months} months on balance transfers</>
                            ) : (
                              <> &amp; balance transfers</>
                            )}
                          </>
                        ) : card.apr.balance_transfer_intro ? (
                          <>
                            <span className="font-bold text-base">{card.apr.balance_transfer_intro.rate}% intro APR</span> for {card.apr.balance_transfer_intro.months} months on balance transfers
                          </>
                        ) : card.apr.purchase_intro ? (
                          <>
                            <span className="font-bold text-base">{card.apr.purchase_intro.rate}% intro APR</span> for {card.apr.purchase_intro.months} months on purchases
                          </>
                        ) : null}
                      </p>
                    </div>
                  )}

                  {/* Top reward categories */}
                  {topRewards.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {topRewards.map((reward, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700"
                        >
                          {reward.value}{reward.unit === '%' ? '%' : 'x'} {reward.category}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Editorial highlight */}
                  {entry.highlight && (
                    <p className="text-sm text-gray-600 mb-4">
                      {entry.highlight}
                    </p>
                  )}

                  {/* Apply buttons */}
                  <ApplyButtons
                    slug={card.slug}
                    applyLink={card.apply_link}
                    referrals={card.referrals}
                    acceptingApplications={card.accepting_applications}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
