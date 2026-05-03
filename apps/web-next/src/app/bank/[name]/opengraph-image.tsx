import { ImageResponse } from 'next/og';
import { OGBackground, OGLogo, loadInterFonts, OG_CACHE_HEADERS } from '@/components/og/og-utils';
import { getCardsByBank } from '@/lib/api';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export const runtime = 'nodejs';

interface Props {
  params: Promise<{ name: string }>;
}

export default async function BankOGImage({ params }: Props) {
  const { name } = await params;
  const bankName = decodeURIComponent(name);

  const [fonts, cards] = await Promise.all([
    loadInterFonts(),
    getCardsByBank(bankName).catch(() => []),
  ]);

  const activeCount = cards.filter((c) => c.accepting_applications !== false).length;

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
            Credit Cards
          </div>

          <div
            style={{
              color: 'white',
              fontSize: 84,
              fontWeight: 'bold',
              letterSpacing: -2,
              textAlign: 'center',
              maxWidth: 1000,
              lineHeight: 1.05,
            }}
          >
            {bankName}
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
              {activeCount} active card{activeCount === 1 ? '' : 's'}
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
              Live approval data
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
