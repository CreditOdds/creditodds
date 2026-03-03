import { ImageResponse } from 'next/og';
import { getCard } from '@/lib/api';
import { OGBackground, OGLogo, loadInterFonts } from '@/components/og/og-utils';

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
      { ...size, fonts }
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
            padding: 60,
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
              <div
                style={{
                  display: 'flex',
                  borderRadius: 20,
                  boxShadow: '0 25px 80px rgba(0,0,0,0.4), 0 10px 30px rgba(0,0,0,0.3)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cardImageUrl}
                  alt={card.card_name}
                  width={480}
                  height={303}
                  style={{ borderRadius: 16 }}
                />
              </div>

              {/* Card name below */}
              <div
                style={{
                  display: 'flex',
                  marginTop: 36,
                  color: 'white',
                  fontSize: card.card_name.length > 30 ? 36 : 44,
                  fontWeight: 'bold',
                  textAlign: 'center',
                  maxWidth: 900,
                }}
              >
                {card.card_name}
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
              <div
                style={{
                  display: 'flex',
                  width: 400,
                  height: 252,
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
              <div
                style={{
                  display: 'flex',
                  marginTop: 36,
                  fontSize: card.card_name.length > 30 ? 36 : 44,
                  fontWeight: 'bold',
                  textAlign: 'center',
                  maxWidth: 900,
                }}
              >
                {card.card_name}
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

        {/* Bank name in bottom right */}
        <div
          style={{
            position: 'absolute',
            bottom: 35,
            right: 50,
            display: 'flex',
            alignItems: 'center',
            color: 'rgba(255,255,255,0.8)',
            fontSize: 24,
          }}
        >
          {card.bank}
        </div>
      </OGBackground>
    ),
    { ...size, fonts }
  );
}
