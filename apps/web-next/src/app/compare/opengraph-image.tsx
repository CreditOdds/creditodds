import { ImageResponse } from 'next/og';
import { OGBackground, OGLogo, loadInterFonts } from '@/components/og/og-utils';

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
          {/* VS comparison visual - two cards with VS badge */}
          <div
            style={{
              display: 'flex',
              position: 'relative',
              width: 440,
              height: 200,
              marginBottom: 40,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Card 1 - left */}
            <div
              style={{
                width: 240,
                height: 150,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.08) 100%)',
                borderRadius: 16,
                boxShadow: '0 15px 40px rgba(0,0,0,0.25)',
                transform: 'rotate(-6deg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 40 }}>💳</span>
            </div>
            {/* VS badge */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 64,
                height: 64,
                borderRadius: 32,
                background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                zIndex: 10,
              }}
            >
              <span style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>VS</span>
            </div>
            {/* Card 2 - right */}
            <div
              style={{
                width: 240,
                height: 150,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.1) 100%)',
                borderRadius: 16,
                boxShadow: '0 15px 40px rgba(0,0,0,0.25)',
                transform: 'rotate(6deg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 40 }}>💳</span>
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
            Compare Credit Cards
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
            Compare up to 3 cards side-by-side
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
    { ...size, fonts }
  );
}
