import { ImageResponse } from 'next/og';
import { OGBackground, OGLogo, loadInterFonts } from '@/components/og/og-utils';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const runtime = 'edge';

export default async function OGImage() {
  const fonts = await loadInterFonts();

  return new ImageResponse(
    (
      <OGBackground>
        <div style={{ display: 'flex', width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: '16px 24px', fontSize: 40 }}>
              <span>&#11088;</span>
              <span style={{ marginLeft: 12, marginRight: 12 }}>&#8594;</span>
              <span>&#128176;</span>
            </div>
          </div>
          <div style={{ color: 'white', fontSize: 48, fontWeight: 'bold', letterSpacing: -1, marginBottom: 16, textAlign: 'center' }}>
            Citi ThankYou Points to USD
          </div>
          <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 28, textAlign: 'center', maxWidth: 800 }}>
            Convert Citi ThankYou points to dollars &bull; 1.0&cent; per point
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 30, left: 40, display: 'flex' }}>
          <OGLogo size={40} />
        </div>
      </OGBackground>
    ),
    { ...size, fonts }
  );
}
