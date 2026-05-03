import { ImageResponse } from 'next/og';
import { OGBackground, OGLogo, loadInterFonts, OG_CACHE_HEADERS } from '@/components/og/og-utils';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export const runtime = 'edge';

export default async function ContactOGImage() {
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
            <span style={{ fontSize: 72 }}>✉️</span>
          </div>

          <div
            style={{
              color: 'white',
              fontSize: 72,
              fontWeight: 'bold',
              letterSpacing: -2,
              marginBottom: 18,
            }}
          >
            Get in touch.
          </div>

          <div
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 28,
              textAlign: 'center',
              maxWidth: 860,
              lineHeight: 1.4,
              marginBottom: 36,
            }}
          >
            Questions, feedback, or ideas — CreditOdds is community-powered and every
            message moves the roadmap.
          </div>

          <div
            style={{
              display: 'flex',
              gap: 14,
            }}
          >
            {['Twitter', 'GitHub', 'Email'].map((label) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 22px',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: 50,
                  color: 'white',
                  fontSize: 18,
                  fontWeight: 500,
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

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
