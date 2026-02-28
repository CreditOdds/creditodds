'use client';

import { useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { CardReferral, trackReferralEvent } from '@/lib/api';

interface ApplyButtonsProps {
  slug: string;
  applyLink?: string;
  referrals?: CardReferral[];
  acceptingApplications: boolean;
}

export function ApplyButtons({ slug, applyLink, referrals, acceptingApplications }: ApplyButtonsProps) {
  const selectedReferral = useMemo(() => {
    if (referrals && referrals.length > 0) {
      const randomIndex = Math.floor(Math.random() * referrals.length);
      return referrals[randomIndex];
    }
    return null;
  }, [referrals]);

  const randomReferralUrl = selectedReferral?.referral_link || null;

  const impressionTracked = useRef(false);
  useEffect(() => {
    if (selectedReferral && !impressionTracked.current) {
      impressionTracked.current = true;
      trackReferralEvent(selectedReferral.referral_id, 'impression').catch(() => {});
    }
  }, [selectedReferral]);

  const handleReferralClick = () => {
    if (selectedReferral) {
      trackReferralEvent(selectedReferral.referral_id, 'click').catch(() => {});
    }
  };

  if (!acceptingApplications) return null;

  const hasButtons = applyLink || randomReferralUrl;
  if (!hasButtons) return null;

  return (
    <div className="flex flex-col sm:flex-row gap-2 items-start">
      {applyLink && (
        <a
          href={applyLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
        >
          Apply Now
        </a>
      )}
      {randomReferralUrl && (
        <a
          href={randomReferralUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleReferralClick}
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white transition-colors animate-shimmer bg-[length:200%_100%]"
          style={{
            backgroundImage: 'linear-gradient(110deg, #5b21b6 0%, #6d28d9 45%, #8b5cf6 55%, #6d28d9 100%)',
          }}
        >
          Apply with Referral
        </a>
      )}
      <Link
        href={`/card/${slug}`}
        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
      >
        See Approval Odds
      </Link>
    </div>
  );
}
