import { ImageResponse } from 'next/og';
import { OGBackground, OGLogo, loadInterFonts, OG_CACHE_HEADERS } from '@/components/og/og-utils';
import { tagLabels, tagDescriptions, type ArticleTag } from '@/lib/articles';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export const runtime = 'edge';

const VALID_TAGS: ArticleTag[] = ['strategy', 'guide', 'analysis', 'news-analysis', 'beginner'];

const TAG_EMOJI: Record<ArticleTag, string> = {
  'strategy': '🎯',
  'guide': '🧭',
  'analysis': '🔍',
  'news-analysis': '📰',
  'beginner': '🌱',
};

function stripEmoji(label: string): string {
  return label.replace(/^[^\w]+\s*/, '');
}

interface Props {
  params: Promise<{ tag: string }>;
}

export default async function CategoryOGImage({ params }: Props) {
  const { tag } = await params;
  const fonts = await loadInterFonts();

  const isValid = VALID_TAGS.includes(tag as ArticleTag);
  const label = isValid ? stripEmoji(tagLabels[tag as ArticleTag]) : 'Articles';
  const description = isValid
    ? tagDescriptions[tag as ArticleTag]
    : 'Long-form credit card content from the CreditOdds editorial team';
  const emoji = isValid ? TAG_EMOJI[tag as ArticleTag] : '📚';

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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 140,
              height: 140,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 28,
              marginBottom: 36,
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
            }}
          >
            <span style={{ fontSize: 72 }}>{emoji}</span>
          </div>

          <div
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 22,
              letterSpacing: 2,
              textTransform: 'uppercase',
              marginBottom: 14,
            }}
          >
            Articles · Category
          </div>

          <div
            style={{
              color: 'white',
              fontSize: 84,
              fontWeight: 'bold',
              letterSpacing: -2,
              textAlign: 'center',
              marginBottom: 18,
              lineHeight: 1.05,
            }}
          >
            {label}
          </div>

          <div
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 26,
              textAlign: 'center',
              maxWidth: 880,
              lineHeight: 1.4,
            }}
          >
            {description}
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
    { ...size, fonts, headers: OG_CACHE_HEADERS }
  );
}
