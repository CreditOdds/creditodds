import { ImageResponse } from 'next/og';
import { getCard } from '@/lib/api';
import { OGBackground, OGLogo, loadInterFonts, OG_CACHE_HEADERS } from '@/components/og/og-utils';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export const runtime = 'edge';

interface Props {
  params: Promise<{ name: string }>;
}

export default async function OGImage({ params }: Props) {
  const { name: slug } = await params;
  const fonts = await loadInterFonts();

  let card;
  try {
    card = await getCard(slug);
  } catch {
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
            <div style={{ display: 'flex', fontSize: 32, marginTop: 16, opacity: 0.9 }}>Card Not Found</div>
          </div>
        </OGBackground>
      ),
      { ...size, fonts, headers: OG_CACHE_HEADERS }
    );
  }

  const cardImageUrl = card.card_image_link
    ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
    : null;

  return new ImageResponse(
    (
      <OGBackground>
        {/* Main content */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            paddingLeft: 50,
            paddingRight: 280,
            paddingTop: 60,
            paddingBottom: 60,
          }}
        >
          {/* Card image or placeholder */}
          {cardImageUrl ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              {/* Card name on top */}
              <div
                style={{
                  display: 'flex',
                  marginBottom: 28,
                  color: 'white',
                  fontSize: card.card_name.length > 30 ? 34 : 42,
                  fontWeight: 'bold',
                  textAlign: 'center',
                  maxWidth: 900,
                }}
              >
                {card.card_name}
              </div>

              <div
                style={{
                  display: 'flex',
                  padding: 6,
                  borderRadius: 20,
                  background: 'rgba(255,255,255,0.08)',
                  boxShadow:
                    '0 0 0 1px rgba(255,255,255,0.12), 0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(109,63,232,0.25)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cardImageUrl}
                  alt={card.card_name}
                  width={420}
                  height={265}
                  style={{ borderRadius: 14 }}
                />
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                color: 'white',
              }}
            >
              {/* Card name on top */}
              <div
                style={{
                  display: 'flex',
                  marginBottom: 28,
                  fontSize: card.card_name.length > 30 ? 34 : 42,
                  fontWeight: 'bold',
                  textAlign: 'center',
                  maxWidth: 900,
                }}
              >
                {card.card_name}
              </div>

              <div
                style={{
                  display: 'flex',
                  width: 380,
                  height: 240,
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 100%)',
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 48,
                  boxShadow: '0 25px 80px rgba(0,0,0,0.3)',
                }}
              >
                💳
              </div>
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

        {/* "Check Your Odds" text on the right */}
        <div
          style={{
            position: 'absolute',
            right: 50,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              color: 'white',
              fontSize: 34,
              fontWeight: 'bold',
              letterSpacing: -0.5,
            }}
          >
            Check Your
          </div>
          <div
            style={{
              display: 'flex',
              color: 'white',
              fontSize: 34,
              fontWeight: 'bold',
              letterSpacing: -0.5,
            }}
          >
            Odds →
          </div>
        </div>

        {/* Bank name bottom right */}
        <div
          style={{
            position: 'absolute',
            bottom: 30,
            right: 50,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'rgba(255,255,255,0.7)',
            fontSize: 20,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M3 21h18v-2H3v2zm0-4h18v-6H3v6zm0-8h18V7l-9-4-9 4v2z" fill="rgba(255,255,255,0.7)" />
          </svg>
          {card.bank}
        </div>
      </OGBackground>
    ),
    { ...size, fonts, headers: OG_CACHE_HEADERS }
  );
}
