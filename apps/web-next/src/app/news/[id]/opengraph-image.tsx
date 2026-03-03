import { ImageResponse } from 'next/og';
import { getNewsItem } from '@/lib/news';
import { OGBackground, OGLogo, loadInterFonts, NEWS_TAG_COLORS, NEWS_TAG_LABELS } from '@/components/og/og-utils';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function OGImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getNewsItem(id);
  const fonts = await loadInterFonts();

  const title = item?.title || 'Card News';
  const date = item?.date
    ? new Date(item.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  // Tag color
  const firstTag = item?.tags?.[0] || 'general';
  const tagColor = NEWS_TAG_COLORS[firstTag] || NEWS_TAG_COLORS['general'];
  const tagLabel = NEWS_TAG_LABELS[firstTag] || 'News';

  // Single card referenced — show card image
  const hasSingleCard = item?.card_slugs?.length === 1 && item?.card_image_links?.[0];
  const cardImageUrl = hasSingleCard
    ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${item!.card_image_links![0]}`
    : null;
  const cardName = hasSingleCard ? item!.card_names?.[0] : null;

  return new ImageResponse(
    (
      <OGBackground accentColor={tagColor.accent}>
        {/* Color-coded accent bar at top */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 5,
            background: tagColor.accent,
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
            padding: '60px 70px',
          }}
        >
          {/* Left side: text */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flex: 1,
              paddingRight: cardImageUrl ? 40 : 0,
            }}
          >
            {/* Tag badge */}
            <div style={{ display: 'flex', marginBottom: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 16px',
                  background: tagColor.bg,
                  borderRadius: 50,
                  color: tagColor.text,
                  fontSize: 16,
                  fontWeight: 'bold',
                }}
              >
                {tagLabel}
              </div>
            </div>

            {/* Date */}
            {date && (
              <div
                style={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: 22,
                  marginBottom: 14,
                }}
              >
                {date}
              </div>
            )}

            {/* Title */}
            <div
              style={{
                color: 'white',
                fontSize: cardImageUrl
                  ? (title.length > 60 ? 34 : 40)
                  : (title.length > 80 ? 40 : 48),
                fontWeight: 'bold',
                letterSpacing: -1,
                lineHeight: 1.2,
                maxWidth: cardImageUrl ? 620 : 1000,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {title}
            </div>
          </div>

          {/* Right side: card image (tilted) */}
          {cardImageUrl && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexShrink: 0,
                transform: 'rotate(-3deg)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  borderRadius: 16,
                  boxShadow: '0 25px 80px rgba(0,0,0,0.4), 0 10px 30px rgba(0,0,0,0.3)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cardImageUrl}
                  alt={cardName || ''}
                  width={380}
                  height={240}
                  style={{ borderRadius: 16 }}
                />
              </div>
              {cardName && (
                <div
                  style={{
                    marginTop: 16,
                    color: 'rgba(255,255,255,0.8)',
                    fontSize: 18,
                    textAlign: 'center',
                    maxWidth: 380,
                  }}
                >
                  {cardName}
                </div>
              )}
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
