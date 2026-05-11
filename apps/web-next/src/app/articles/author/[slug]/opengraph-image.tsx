import { ImageResponse } from 'next/og';
import { OGBackground, OGLogo, loadInterFonts, OG_CACHE_HEADERS } from '@/components/og/og-utils';
import { getArticles, getUniqueAuthors } from '@/lib/articles';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export const runtime = 'nodejs';

interface Props {
  params: Promise<{ slug: string }>;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default async function AuthorOGImage({ params }: Props) {
  const { slug } = await params;
  const fonts = await loadInterFonts();
  const articles = await getArticles();
  const author = getUniqueAuthors(articles).find((a) => a.slug === slug);

  const name = author?.name ?? 'CreditOdds Author';
  const count = author?.count ?? 0;
  const subtitle = author
    ? `${count} article${count !== 1 ? 's' : ''} on credit card strategy`
    : 'Long-form credit card content from the CreditOdds editorial team';

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
              borderRadius: 70,
              marginBottom: 36,
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
              color: 'white',
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: -1,
            }}
          >
            {initials(name) || 'CO'}
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
            Articles · Author
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
            {name}
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
            {subtitle}
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
