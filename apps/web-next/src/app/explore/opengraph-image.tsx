import { ImageResponse } from 'next/og';
import { OGBackground, OGLogo, loadInterFonts, OG_CACHE_HEADERS } from '@/components/og/og-utils';

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
        {/* Main content */}
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
          {/* Card stack illustration */}
          <div
            style={{
              display: 'flex',
              position: 'relative',
              width: 400,
              height: 200,
              marginBottom: 40,
            }}
          >
            {/* Card 1 - back */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 30,
                width: 280,
                height: 176,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
                borderRadius: 16,
                boxShadow: '0 15px 40px rgba(0,0,0,0.2)',
                transform: 'rotate(-8deg)',
                display: 'flex',
              }}
            />
            {/* Card 2 - middle */}
            <div
              style={{
                position: 'absolute',
                left: 60,
                top: 15,
                width: 280,
                height: 176,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.08) 100%)',
                borderRadius: 16,
                boxShadow: '0 15px 40px rgba(0,0,0,0.25)',
                transform: 'rotate(-2deg)',
                display: 'flex',
              }}
            />
            {/* Card 3 - front */}
            <div
              style={{
                position: 'absolute',
                left: 120,
                top: 0,
                width: 280,
                height: 176,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.1) 100%)',
                borderRadius: 16,
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                transform: 'rotate(4deg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 48 }}>🔍</span>
            </div>
          </div>

          {/* Title */}
          <div
            style={{
              color: 'white',
              fontSize: 56,
              fontWeight: 'bold',
              letterSpacing: -1,
              marginBottom: 16,
            }}
          >
            Explore Credit Cards
          </div>

          {/* Subtitle */}
          <div
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 28,
              textAlign: 'center',
              maxWidth: 800,
            }}
          >
            Browse all cards and find the perfect match for your credit profile
          </div>
        </div>

        {/* Logo in bottom left */}
        <div
          style={{
            position: 'absolute',
            bottom: 30,
            left: 40,
            display: 'flex',
          }}
        >
          <OGLogo size={40} />
        </div>
      </OGBackground>
    ),
    { ...size, fonts, headers: OG_CACHE_HEADERS }
  );
}
