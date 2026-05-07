import { ImageResponse } from 'next/og';
import { OGBackground, OGLogo, loadInterFonts, OG_CACHE_HEADERS } from '@/components/og/og-utils';
import { getStore } from '@/lib/stores';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export const runtime = 'nodejs';

interface Props {
  params: Promise<{ slug: string }>;
}

// Mirror of the page's tag-label map for OG copy. Keep in sync with the
// CATEGORY_TAG_LABELS map in app/best-card-for/[slug]/page.tsx — duplicated
// rather than imported to keep the OG route's runtime imports minimal
// (next/og pulls everything from the importing route into its bundle).
const CATEGORY_TAG_LABELS: Record<string, string> = {
  department_stores: 'Department Store',
  online_shopping: 'Online Shopping',
  groceries: 'Groceries',
  dining: 'Dining',
  gas: 'Gas',
  travel: 'Travel',
  home_improvement: 'Home Improvement',
  drugstores: 'Drugstore',
  wholesale_clubs: 'Wholesale Club',
  amazon: 'Amazon',
};

function tagLabelForCategory(id: string): string {
  return CATEGORY_TAG_LABELS[id]
    || id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default async function StoreOGImage({ params }: Props) {
  const { slug } = await params;
  const [fonts, store] = await Promise.all([
    loadInterFonts(),
    getStore(slug).catch(() => null),
  ]);

  // Defensive fallback so 404s during build don't blow up OG generation.
  const name =
    store?.name ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const title = `Best card to use at ${name}`;
  const description = `Top picks for earning rewards at ${name} — co-brands, category bonuses, and flat-rate fallbacks compared.`;
  const tags = (store?.categories ?? []).map(tagLabelForCategory);

  // Auto-shrink title for long store names so it stays on one or two lines.
  const titleSize = title.length > 44 ? 44 : title.length > 36 ? 50 : 56;

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
          {/* Icon — same trophy treatment as /best/[slug] */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 120,
              height: 120,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 24,
              marginBottom: 36,
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
            }}
          >
            <span style={{ fontSize: 60 }}>🏆</span>
          </div>

          {/* Title */}
          <div
            style={{
              color: 'white',
              fontSize: titleSize,
              fontWeight: 'bold',
              letterSpacing: -1,
              marginBottom: 16,
              textAlign: 'center',
              maxWidth: 1000,
              lineHeight: 1.05,
            }}
          >
            {title}
          </div>

          {/* Description */}
          <div
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 26,
              textAlign: 'center',
              maxWidth: 880,
              lineHeight: 1.4,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {description}
          </div>

          {/* Category pills */}
          {tags.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 12,
                marginTop: 36,
                flexWrap: 'wrap',
                justifyContent: 'center',
                maxWidth: 1000,
              }}
            >
              {tags.slice(0, 3).map((t) => (
                <div
                  key={t}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 24px',
                    background: 'rgba(255,255,255,0.15)',
                    borderRadius: 999,
                    color: 'white',
                    fontSize: 20,
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Logo */}
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
