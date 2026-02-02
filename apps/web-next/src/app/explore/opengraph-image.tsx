import { ImageResponse } from 'next/og';

// Image dimensions for OG images
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export const runtime = 'edge';

export default async function OGImage() {
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
      </div>
    ),
    { ...size }
  );
}
