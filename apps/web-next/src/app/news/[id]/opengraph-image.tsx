import { ImageResponse } from 'next/og';
import { getNewsItem } from '@/lib/news';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export const runtime = 'edge';

export default async function OGImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getNewsItem(id);

  const title = item?.title || 'Card News';
  const date = item?.date
    ? new Date(item.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

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
            justifyContent: 'center',
            padding: '60px 80px',
          }}
        >
          {/* Date */}
          {date && (
            <div
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: 24,
                marginBottom: 16,
              }}
            >
              {date}
            </div>
          )}

          {/* Title */}
          <div
            style={{
              color: 'white',
              fontSize: title.length > 80 ? 40 : 48,
              fontWeight: 'bold',
              letterSpacing: -1,
              lineHeight: 1.2,
              maxWidth: 1000,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {title}
          </div>

          {/* Tag line */}
          <div
            style={{
              display: 'flex',
              marginTop: 32,
              gap: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 20px',
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 50,
                color: 'white',
                fontSize: 18,
              }}
            >
              Card News
            </div>
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
