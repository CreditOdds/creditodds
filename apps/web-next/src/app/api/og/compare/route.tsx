import { ImageResponse } from 'next/og';
import { OGBackground, OGLogo, loadInterFonts } from '@/components/og/og-utils';
import { getAllCards } from '@/lib/api';

export const runtime = 'edge';

const size = {
  width: 1200,
  height: 630,
};

const CDN_BASE = 'https://d3ay3etzd1512y.cloudfront.net/card_images';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cardsParam = searchParams.get('cards');
  const fonts = await loadInterFonts();

  if (!cardsParam) {
    return renderFallback(fonts);
  }

  const slugs = cardsParam.split(',').filter(Boolean).slice(0, 3);
  if (slugs.length === 0) {
    return renderFallback(fonts);
  }

  const allCards = await getAllCards();
  const matchedCards = slugs
    .map((slug) => allCards.find((c) => c.slug === slug))
    .filter(Boolean);

  if (matchedCards.length === 0) {
    return renderFallback(fonts);
  }

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
            padding: '40px 60px',
          }}
        >
          {/* Title */}
          <div
            style={{
              color: 'white',
              fontSize: 44,
              fontWeight: 'bold',
              letterSpacing: -1,
              marginBottom: 40,
            }}
          >
            Compare Credit Cards
          </div>

          {/* Cards side by side */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: matchedCards.length === 1 ? 0 : 48,
            }}
          >
            {matchedCards.map((card, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                {/* Card image or placeholder */}
                {card!.card_image_link ? (
                  <img
                    src={`${CDN_BASE}/${card!.card_image_link}`}
                    width={280}
                    height={176}
                    style={{
                      objectFit: 'contain',
                      borderRadius: 12,
                      boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 280,
                      height: 176,
                      background: 'linear-gradient(145deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.08) 100%)',
                      borderRadius: 12,
                      boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{ fontSize: 48 }}>💳</span>
                  </div>
                )}
                {/* Card name */}
                <div
                  style={{
                    color: 'rgba(255,255,255,0.95)',
                    fontSize: matchedCards.length >= 3 ? 18 : 22,
                    fontWeight: 'bold',
                    textAlign: 'center',
                    maxWidth: 280,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {card!.card_name}
                </div>
              </div>
            ))}

            {/* VS badges between cards */}
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

function renderFallback(fonts: Awaited<ReturnType<typeof loadInterFonts>>) {
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
              color: 'white',
              fontSize: 56,
              fontWeight: 'bold',
              letterSpacing: -1,
              marginBottom: 16,
            }}
          >
            Compare Credit Cards
          </div>
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
