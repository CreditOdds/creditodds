import { ImageResponse } from 'next/og';
import { getCard } from '@/lib/api';

// Image dimensions for OG images
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

// Allow dynamic generation
export const runtime = 'edge';

interface Props {
  params: Promise<{ name: string }>;
}

export default async function OGImage({ params }: Props) {
  const { name: slug } = await params;

  let card;
  try {
    card = await getCard(slug);
  } catch {
    // Return a default image if card not found
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #504DE1 0%, #7C3AED 50%, #4F46E5 100%)',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              color: 'white',
            }}
          >
            <div style={{ fontSize: 64, fontWeight: 'bold' }}>CreditOdds</div>
            <div style={{ fontSize: 32, marginTop: 16, opacity: 0.9 }}>Card Not Found</div>
          </div>
        </div>
      ),
      { ...size }
    );
  }

  const cardImageUrl = card.card_image_link
    ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: 'linear-gradient(135deg, #504DE1 0%, #7C3AED 50%, #4F46E5 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Background pattern overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.1) 0%, transparent 50%)',
            display: 'flex',
          }}
        />

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
              {/* Card with shadow effect */}
              <div
                style={{
                  display: 'flex',
                  borderRadius: 24,
                  boxShadow: '0 25px 80px rgba(0,0,0,0.4), 0 10px 30px rgba(0,0,0,0.3)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cardImageUrl}
                  alt={card.card_name}
                  width={500}
                  height={315}
                  style={{
                    borderRadius: 16,
                  }}
                />
              </div>

              {/* Card name below */}
              <div
                style={{
                  marginTop: 40,
                  color: 'white',
                  fontSize: 42,
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
                  width: 400,
                  height: 252,
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 100%)',
                  borderRadius: 16,
                  display: 'flex',
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
                  marginTop: 40,
                  fontSize: 42,
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

        {/* Logo in bottom left corner */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            left: 50,
            display: 'flex',
            alignItems: 'center',
            color: 'white',
          }}
        >
          {/* Logo icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 180 180"
            style={{ marginRight: 12 }}
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
          <span style={{ fontSize: 32, fontWeight: 'bold', letterSpacing: -0.5 }}>
            CreditOdds
          </span>
        </div>

        {/* Bank name in bottom right */}
        <div
          style={{
            position: 'absolute',
            bottom: 45,
            right: 50,
            display: 'flex',
            alignItems: 'center',
            color: 'rgba(255,255,255,0.8)',
            fontSize: 24,
          }}
        >
          {card.bank}
        </div>
      </div>
    ),
    { ...size }
  );
}
