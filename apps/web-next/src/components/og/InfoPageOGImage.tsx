import { ImageResponse } from 'next/og';

// Image dimensions for OG images
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function InfoPageOGImage() {
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
          {/* Logo */}
          <svg
            width="100"
            height="100"
            viewBox="0 0 180 180"
            style={{ marginBottom: 30 }}
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

          {/* Title */}
          <div
            style={{
              color: 'white',
              fontSize: 64,
              fontWeight: 'bold',
              letterSpacing: -1,
              marginBottom: 20,
            }}
          >
            CreditOdds
          </div>

          {/* Tagline */}
          <div
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 28,
              textAlign: 'center',
              maxWidth: 700,
            }}
          >
            Community-powered credit card approval odds
          </div>

          {/* Website URL */}
          <div
            style={{
              marginTop: 50,
              color: 'rgba(255,255,255,0.7)',
              fontSize: 24,
              display: 'flex',
              alignItems: 'center',
              padding: '12px 28px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 50,
            }}
          >
            creditodds.com
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
