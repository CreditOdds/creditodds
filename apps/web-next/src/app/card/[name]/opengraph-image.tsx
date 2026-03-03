import { ImageResponse } from 'next/og';
import { getCard } from '@/lib/api';
import { OGBackground, OGLogo, loadInterFonts } from '@/components/og/og-utils';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export const runtime = 'edge';

interface Props {
  params: Promise<{ name: string }>;
}

export default async function OGImage({ params }: Props) {
  const { name: slug } = await params;
  const fonts = await loadInterFonts();

  let card;
  try {
    card = await getCard(slug);
  } catch {
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
            <div style={{ fontSize: 32, marginTop: 16, opacity: 0.9 }}>Card Not Found</div>
          </div>
        </OGBackground>
      ),
      { ...size, fonts }
    );
  }

  const cardImageUrl = card.card_image_link
    ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
    : null;

  const totalRecords = card.total_records || 0;
  const approvedCount = card.approved_count || 0;
  const approvalRate = totalRecords > 0 ? Math.round((approvedCount / totalRecords) * 100) : 0;
  const medianScore = card.approved_median_credit_score || 0;
  const hasStats = totalRecords > 0;

  return new ImageResponse(
    (
      <OGBackground>
        {/* Main content — two-column layout */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            padding: '60px 70px',
          }}
        >
          {/* Left side: text + stats */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flex: 1,
              paddingRight: cardImageUrl ? 40 : 0,
            }}
          >
            {/* Bank */}
            <div
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: 22,
                marginBottom: 12,
              }}
            >
              {card.bank}
            </div>

            {/* Card name */}
            <div
              style={{
                color: 'white',
                fontSize: card.card_name.length > 30 ? 36 : 44,
                fontWeight: 'bold',
                letterSpacing: -1,
                lineHeight: 1.15,
                maxWidth: 580,
                marginBottom: hasStats ? 32 : 0,
              }}
            >
              {card.card_name}
            </div>

            {/* Stats boxes */}
            {hasStats && (
              <div style={{ display: 'flex', gap: 16 }}>
                {/* Approval Rate */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '16px 20px',
                    background: 'rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.15)',
                    minWidth: 130,
                  }}
                >
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 6 }}>
                    Approval Rate
                  </div>
                  <div style={{ color: 'white', fontSize: 32, fontWeight: 'bold' }}>
                    {approvalRate}%
                  </div>
                </div>

                {/* Median Score */}
                {medianScore > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '16px 20px',
                      background: 'rgba(255,255,255,0.12)',
                      backdropFilter: 'blur(10px)',
                      borderRadius: 14,
                      border: '1px solid rgba(255,255,255,0.15)',
                      minWidth: 130,
                    }}
                  >
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 6 }}>
                      Median Score
                    </div>
                    <div style={{ color: 'white', fontSize: 32, fontWeight: 'bold' }}>
                      {medianScore}
                    </div>
                  </div>
                )}

                {/* Data Points */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '16px 20px',
                    background: 'rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.15)',
                    minWidth: 130,
                  }}
                >
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 6 }}>
                    Data Points
                  </div>
                  <div style={{ color: 'white', fontSize: 32, fontWeight: 'bold' }}>
                    {totalRecords}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right side: card image (slightly rotated) */}
          {cardImageUrl ? (
            <div
              style={{
                display: 'flex',
                flexShrink: 0,
                transform: 'rotate(3deg)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  borderRadius: 20,
                  boxShadow: '0 25px 80px rgba(0,0,0,0.4), 0 10px 30px rgba(0,0,0,0.3)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cardImageUrl}
                  alt={card.card_name}
                  width={420}
                  height={265}
                  style={{ borderRadius: 16 }}
                />
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexShrink: 0,
                width: 350,
                height: 220,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 100%)',
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 64,
                boxShadow: '0 25px 80px rgba(0,0,0,0.3)',
                transform: 'rotate(3deg)',
              }}
            >
              💳
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
