import { ImageResponse } from 'next/og';
import { OGBackground, loadInterFonts, OG_CACHE_HEADERS } from '@/components/og/og-utils';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export const runtime = 'edge';

export default async function OGImage() {
  const fonts = await loadInterFonts();

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
        </div>
      </OGBackground>
    ),
    {
      ...size,
      fonts,
      headers: OG_CACHE_HEADERS,
    }
  );
}
