import { ImageResponse } from 'next/og';
import { getArticle } from '@/lib/articles';
import { OGBackground, OGLogo, loadInterFonts, ARTICLE_TAG_COLORS, ARTICLE_TAG_LABELS } from '@/components/og/og-utils';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export const runtime = 'edge';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function OGImage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticle(slug);
  const fonts = await loadInterFonts();

  if (!article) {
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
            <div style={{ fontSize: 64, fontWeight: 'bold' }}>CreditOdds</div>
            <div style={{ fontSize: 32, marginTop: 16, opacity: 0.9 }}>Article Not Found</div>
          </div>
        </OGBackground>
      ),
      { ...size, fonts }
    );
  }

  const firstTag = article.tags?.[0];
  const tagColor = firstTag ? ARTICLE_TAG_COLORS[firstTag] : null;
  const tagLabel = firstTag ? ARTICLE_TAG_LABELS[firstTag] : null;
  const accentColor = tagColor?.accent;

  const articleImageUrl = article.image
    ? `https://d2hxvzw7msbtvt.cloudfront.net/article_images/${article.image}`
    : null;

  // Scale title font size based on length and image presence
  const titleLen = article.title.length;
  let titleSize: number;
  if (articleImageUrl) {
    titleSize = titleLen > 80 ? 30 : titleLen > 50 ? 36 : 42;
  } else {
    titleSize = titleLen > 80 ? 38 : titleLen > 50 ? 44 : 52;
  }

  const date = new Date(article.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return new ImageResponse(
    (
      <OGBackground accentColor={accentColor}>
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
              paddingRight: articleImageUrl ? 40 : 0,
            }}
          >
            {/* Tag badge */}
            {tagColor && tagLabel && (
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
            )}

            {/* Title */}
            <div
              style={{
                color: 'white',
                fontSize: titleSize,
                fontWeight: 'bold',
                letterSpacing: -1,
                lineHeight: 1.2,
                maxWidth: articleImageUrl ? 600 : 1000,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {article.title}
            </div>

            {/* Author + reading time */}
            <div
              style={{
                display: 'flex',
                marginTop: 20,
                gap: 20,
                color: 'rgba(255,255,255,0.7)',
                fontSize: 20,
              }}
            >
              <span>{article.author}</span>
              <span>·</span>
              <span>{date}</span>
              <span>·</span>
              <span>{article.reading_time} min read</span>
            </div>
          </div>

          {/* Right side: article image */}
          {articleImageUrl && (
            <div
              style={{
                display: 'flex',
                flexShrink: 0,
                borderRadius: 16,
                boxShadow: '0 25px 80px rgba(0,0,0,0.4), 0 10px 30px rgba(0,0,0,0.3)',
                overflow: 'hidden',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={articleImageUrl}
                alt={article.title}
                width={420}
                height={280}
                style={{ objectFit: 'cover' }}
              />
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
