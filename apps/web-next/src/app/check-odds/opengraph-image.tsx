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
          {/* Icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 140,
              height: 140,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 28,
              marginBottom: 40,
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
            }}
          >
            <span style={{ fontSize: 72 }}>🎯</span>
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
            Check Your Odds
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
            See your approval chances across all credit cards based on your profile
          </div>

          {/* Feature tags */}
          <div
            style={{
              display: 'flex',
              marginTop: 40,
              gap: 16,
            }}
          >
            {['Credit Score', 'Income', 'Approval Rate'].map((label) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 20px',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: 50,
                  color: 'white',
                  fontSize: 18,
                }}
              >
                {label}
              </div>
            ))}
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
