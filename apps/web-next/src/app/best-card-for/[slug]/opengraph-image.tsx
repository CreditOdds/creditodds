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
  const name = store?.name ?? slug.replace(/-/g, ' ');
  const tags = (store?.categories ?? []).map(tagLabelForCategory);

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
              color: 'rgba(255,255,255,0.85)',
              fontSize: 24,
              letterSpacing: 2,
              textTransform: 'uppercase',
              marginBottom: 16,
            }}
          >
            Best Credit Card to Use At
          </div>

          <div
            style={{
              color: 'white',
              fontSize: 88,
              fontWeight: 'bold',
              letterSpacing: -2,
              textAlign: 'center',
              maxWidth: 1080,
              lineHeight: 1.05,
            }}
          >
            {name}
          </div>

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
                    padding: '10px 22px',
                    background: 'rgba(255,255,255,0.18)',
                    borderRadius: 999,
                    color: 'white',
                    fontSize: 22,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          )}
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
