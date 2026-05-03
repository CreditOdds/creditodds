import { ImageResponse } from 'next/og';
import { OGBackground, OGLogo, loadInterFonts, OG_CACHE_HEADERS } from '@/components/og/og-utils';
import { getAllStores } from '@/lib/stores';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export const runtime = 'nodejs';

export default async function BestCardForIndexOGImage() {
  const [fonts, stores] = await Promise.all([
    loadInterFonts(),
    getAllStores().catch(() => []),
  ]);

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
            Best Credit Card by Store
          </div>

          {/* vercel/og rule: divs with >1 child must be flex/none. JSX
              interpolation expands to multiple children, so we collapse to
              a single string at the JS level. */}
          <div
            style={{
              color: 'white',
              fontSize: 76,
              fontWeight: 'bold',
              letterSpacing: -2,
              textAlign: 'center',
              maxWidth: 1000,
              lineHeight: 1.05,
            }}
          >
            {`What card to use at ${stores.length}+ U.S. retailers.`}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 24,
              marginTop: 36,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 24px',
                background: 'rgba(255,255,255,0.18)',
                borderRadius: 999,
                color: 'white',
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              {`${stores.length} stores`}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 24px',
                background: 'rgba(255,255,255,0.12)',
                borderRadius: 999,
                color: 'white',
                fontSize: 22,
              }}
            >
              Honest, mode-aware ranking
            </div>
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
