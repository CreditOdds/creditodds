import { ImageResponse } from 'next/og';
import { OGBackground, OGLogo, loadInterFonts, formatStatNumber } from '@/components/og/og-utils';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export const runtime = 'edge';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://d2ojrhbh2dincr.cloudfront.net';

export default async function OGImage() {
  let totalRecords = 0;
  let totalContributors = 0;
  let cardCount = 0;

  try {
    const [leaderboardRes, cardsRes] = await Promise.all([
      fetch(`${API_BASE}/leaderboard?limit=1`, { next: { revalidate: 300 } }),
      fetch(`${API_BASE}/cards`, { next: { revalidate: 300 } }),
    ]);

    if (leaderboardRes.ok) {
      const data = await leaderboardRes.json();
      totalRecords = data.stats?.total_records || 0;
      totalContributors = data.stats?.total_contributors || 0;
    }

    if (cardsRes.ok) {
      const cards = await cardsRes.json();
      cardCount = Array.isArray(cards) ? cards.length : 0;
    }
  } catch {
    // Graceful fallback — use zeros
  }

  const fonts = await loadInterFonts();

  const pills = [
    totalRecords > 0 ? `${formatStatNumber(totalRecords)} Data Points` : 'Real Data Points',
    totalContributors > 0 ? `${formatStatNumber(totalContributors)} Users` : 'Community Powered',
    cardCount > 0 ? `${formatStatNumber(cardCount)} Cards Tracked` : '100% Free',
  ];

  return new ImageResponse(
    (
      <OGBackground>
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 60,
          }}
        >
          {/* Logo icon */}
          <svg
            width="120"
            height="120"
            viewBox="0 0 180 180"
            style={{ marginBottom: 30 }}
          >
            <ellipse cx="138.19" cy="63.59" rx="9" ry="10.38" fill="white" />
            <ellipse cx="161.11" cy="68.38" rx="7.02" ry="8.09" fill="white" />
            <ellipse cx="138.71" cy="97.12" rx="9" ry="10.38" fill="white" />
            <ellipse cx="161.63" cy="101.92" rx="7.02" ry="8.09" fill="white" />
            <path
              d="M114.57,53.6V33.17c0-4.47-3.53-7.45-6.66-5.63l-42.9,24.98c-1.7,0.99-2.8,3.2-2.8,5.63v17.29L114.57,53.6z"
              fill="white"
            />
            <path
              d="M62.22,91.14v30.3c0,3.41,2.12,6.17,4.73,6.17h42.9c2.61,0,4.73-2.76,4.73-6.17V74.71L62.22,91.14z"
              fill="white"
            />
          </svg>

          {/* Title */}
          <div
            style={{
              color: 'white',
              fontSize: 72,
              fontWeight: 'bold',
              letterSpacing: -1,
              marginBottom: 20,
            }}
          >
            CreditOdds
          </div>

          {/* Tagline */}
          <div
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 32,
              textAlign: 'center',
              maxWidth: 800,
            }}
          >
            Discover Your Credit Card Approval Odds
          </div>

          {/* Dynamic stat pills */}
          <div
            style={{
              display: 'flex',
              marginTop: 40,
              gap: 20,
            }}
          >
            {pills.map((pill) => (
              <div
                key={pill}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 24px',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: 50,
                  color: 'white',
                  fontSize: 20,
                }}
              >
                {pill}
              </div>
            ))}
          </div>
        </div>
      </OGBackground>
    ),
    {
      ...size,
      fonts,
    }
  );
}
