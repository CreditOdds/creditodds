import { ImageResponse } from 'next/og';
import { getBestPage } from '@/lib/best';
import { OGBackground, OGLogo, loadInterFonts } from '@/components/og/og-utils';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function OGImage({ params }: Props) {
  const { slug } = await params;
  const page = await getBestPage(slug);
  const fonts = await loadInterFonts();

  if (!page) {
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
              color: 'white',
            }}
          >
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 'bold' }}>CreditOdds</div>
            <div style={{ display: 'flex', fontSize: 32, marginTop: 16, opacity: 0.9 }}>Page Not Found</div>
          </div>
        </OGBackground>
      ),
      { ...size, fonts }
    );
  }

  const titleLen = page.title.length;
  const titleSize = titleLen > 40 ? 42 : 52;
  const cardCount = page.cards?.length || 0;

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
              width: 120,
              height: 120,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 24,
              marginBottom: 36,
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
            }}
          >
            <span style={{ fontSize: 60 }}>🏆</span>
          </div>

          {/* Title */}
          <div
            style={{
              color: 'white',
              fontSize: titleSize,
              fontWeight: 'bold',
              letterSpacing: -1,
              marginBottom: 16,
              textAlign: 'center',
              maxWidth: 1000,
            }}
          >
            {page.title}
          </div>

          {/* Description */}
          <div
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 26,
              textAlign: 'center',
              maxWidth: 800,
              lineHeight: 1.4,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {page.description}
          </div>

          {/* Card count pill */}
          {cardCount > 0 && (
            <div
              style={{
                display: 'flex',
                marginTop: 36,
                alignItems: 'center',
                padding: '10px 24px',
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 50,
                color: 'white',
                fontSize: 20,
              }}
            >
              {`${cardCount} Cards Ranked`}
            </div>
          )}
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
