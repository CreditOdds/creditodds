import { ImageResponse } from 'next/og';
import { getNewsItem } from '@/lib/news';
import {
  loadInterFonts,
  OG_CACHE_HEADERS,
  NEWS_TAG_LABELS,
} from '@/components/og/og-utils';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

// ── Tone palette (mirrors social-cards.css `.so--*` tone variants) ──
const TONE = {
  purple: { accent: '#b794ff', glow: 'rgba(109,63,232,0.42)', hair: '#b794ff', tagBg: '#2a1a52',  tagBorder: 'rgba(183,148,255,0.30)', tagText: '#b794ff' },
  good:   { accent: '#3eccaa', glow: 'rgba(62,204,170,0.32)', hair: '#3eccaa', tagBg: '#0a2a23',  tagBorder: 'rgba(62,204,170,0.30)',  tagText: '#3eccaa' },
  warn:   { accent: '#ff7aa3', glow: 'rgba(255,122,163,0.32)', hair: '#ff7aa3', tagBg: '#2d0a1a', tagBorder: 'rgba(255,122,163,0.30)', tagText: '#ff7aa3' },
  gold:   { accent: '#f0c85a', glow: 'rgba(240,200,90,0.28)', hair: '#f0c85a', tagBg: '#2a200a',  tagBorder: 'rgba(240,200,90,0.30)',  tagText: '#f0c85a' },
} as const;

type ToneKey = keyof typeof TONE;

// Map news tag → tone (mirrors og-utils NEWS_TAG_COLORS semantics)
function toneForTag(tag: string): ToneKey {
  switch (tag) {
    case 'new-card':       return 'good';
    case 'discontinued':   return 'warn';
    case 'fee-change':     return 'gold';
    case 'limited-time':   return 'gold';
    case 'bonus-change':
    case 'benefit-change':
    case 'policy-change':
    case 'general':
    default:               return 'purple';
  }
}

const SO_PAPER = '#0d0a1a';
const SO_INK = '#f4f1ff';
const SO_INK_2 = '#cfc8e4';
const SO_MUTED = '#8d85a8';
const SO_LINE = '#241d3a';

// Pre-fetch the card image server-side and embed as a data URL so Satori
// (which doesn't support WebP) never has to make the request itself. Some
// CDN entries are WebP files renamed to .png; we sniff magic bytes and skip
// those so the news OG falls back to the type-only layout instead of a blank
// placeholder.
async function fetchCardImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'image/png,image/jpeg,*/*;q=0.5' } });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 16) return null;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return `data:image/png;base64,${bytes.toString('base64')}`;
    }
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return `data:image/jpeg;base64,${bytes.toString('base64')}`;
    }
    // WebP and other formats Satori can't decode → skip, fall back to type-only
    return null;
  } catch {
    return null;
  }
}

export default async function OGImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getNewsItem(id);
  const fonts = await loadInterFonts();

  const title = item?.title || 'Card News';
  const date = item?.date
    ? new Date(item.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const firstTag = item?.tags?.[0] || 'general';
  const tagLabel = NEWS_TAG_LABELS[firstTag] || 'News';
  const tone = TONE[toneForTag(firstTag)];

  // Single card referenced — show card image (split layout); otherwise type-only
  const hasSingleCard = item?.card_slugs?.length === 1 && item?.card_image_links?.[0];
  const cardImageDataUrl = hasSingleCard
    ? await fetchCardImageAsDataUrl(`https://d3ay3etzd1512y.cloudfront.net/card_images/${item!.card_image_links![0]}`)
    : null;
  const cardName = hasSingleCard ? item!.card_names?.[0] : null;

  // Title sizing: split layout has narrower column (~14ch), type-only goes wide.
  // Bigger type when title is short, smaller when long, matching design's text-balance behavior.
  const titleSize = cardImageDataUrl
    ? (title.length > 70 ? 38 : title.length > 45 ? 44 : 50)
    : (title.length > 90 ? 48 : title.length > 60 ? 58 : 70);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          display: 'flex',
          background: SO_PAPER,
          color: SO_INK,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {/* Dot grid backdrop (faded top→bottom) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(183,148,255,0.07) 1px, transparent 1.4px)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Tone radial — top-right primary */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(ellipse 60% 70% at 90% 10%, ${tone.glow} 0%, transparent 60%)`,
          }}
        />
        {/* Tone radial — bottom-left secondary */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: 'radial-gradient(ellipse 50% 60% at 0% 100%, rgba(183,148,255,0.10) 0%, transparent 55%)',
          }}
        />

        {/* Hairline accent at top-left of frame */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 64,
            width: 96,
            height: 3,
            background: tone.hair,
            borderRadius: '0 0 2px 2px',
            display: 'flex',
          }}
        />

        {/* Content area (top:0 → bottom:56px, padding mirrors .so-content) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 56,
            padding: '40px 56px 8px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Layout: split (with card art) OR type-only (full width) */}
          {cardImageDataUrl ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                width: '100%',
                height: '100%',
                alignItems: 'center',
              }}
            >
              {/* Left column: text */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  minWidth: 0,
                  paddingRight: 40,
                }}
              >
                <NewsMeta tone={tone} tagLabel={tagLabel} date={date} />
                <div
                  style={{
                    fontSize: titleSize,
                    fontWeight: 700,
                    letterSpacing: -1.2,
                    lineHeight: 1.05,
                    color: SO_INK,
                    marginTop: 22,
                  }}
                >
                  {title}
                </div>
              </div>

              {/* Right column: card art tilted */}
              <div
                style={{
                  width: 380,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transform: 'rotate(-4deg)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    borderRadius: 16,
                    overflow: 'hidden',
                    boxShadow:
                      '0 30px 60px -20px rgba(0,0,0,0.6), 0 8px 22px -8px rgba(109,63,232,0.35)',
                  }}
                >
                  <img
                    src={cardImageDataUrl}
                    alt={cardName || ''}
                    width={380}
                    height={238}
                    style={{ borderRadius: 16, display: 'block' }}
                  />
                </div>
              </div>
            </div>
          ) : (
            // Type-only: title spans full width
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
              }}
            >
              <NewsMeta tone={tone} tagLabel={tagLabel} date={date} />
              <div
                style={{
                  display: 'flex',
                  flex: 1,
                  alignItems: 'center',
                  width: '100%',
                  marginTop: 22,
                }}
              >
                <div
                  style={{
                    fontSize: titleSize,
                    fontWeight: 700,
                    letterSpacing: -1.5,
                    lineHeight: 1.0,
                    color: SO_INK,
                    width: '100%',
                  }}
                >
                  {title}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer band */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 56,
            padding: '0 56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(7,5,15,0.55)',
            borderTop: `1px solid ${SO_LINE}`,
          }}
        >
          {/* Wordmark — concentric ring brand-mark + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <BrandMark size={22} accent={tone.accent} />
            <div
              style={{
                display: 'flex',
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: -0.4,
                color: SO_INK,
              }}
            >
              <span>Credit</span>
              <span style={{ color: tone.accent, fontWeight: 500 }}>Odds</span>
            </div>
          </div>
          {/* URL + meta */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              color: SO_MUTED,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            <div style={{ display: 'flex', fontSize: 14, color: SO_INK_2, letterSpacing: 0.3, textTransform: 'none' }}>
              <span>creditodds.com</span>
              <span style={{ color: SO_MUTED, margin: '0 4px' }}>/</span>
              <span style={{ color: tone.accent }}>news</span>
            </div>
            <div style={{ display: 'flex', width: 1, height: 14, background: '#362d52', margin: '0 4px' }} />
            <div style={{ display: 'flex' }}>{date ? date.toUpperCase() : 'CREDITODDS NEWSROOM'}</div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts, headers: OG_CACHE_HEADERS }
  );
}

// ── Subcomponents ──

function NewsMeta({
  tone,
  tagLabel,
  date,
}: {
  tone: typeof TONE[ToneKey];
  tagLabel: string;
  date: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          background: tone.tagBg,
          color: tone.tagText,
          border: `1px solid ${tone.tagBorder}`,
          marginRight: 14,
        }}
      >
        {tagLabel}
      </div>
      {date && (
        <div
          style={{
            display: 'flex',
            fontSize: 13,
            color: SO_MUTED,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            fontWeight: 500,
          }}
        >
          {date}
        </div>
      )}
    </div>
  );
}

function BrandMark({ size = 22, accent = '#b794ff' }: { size?: number; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
      <circle cx="16" cy="16" r="14" fill="none" stroke={SO_INK} strokeOpacity="0.25" strokeWidth="2" />
      <path d="M 16 4 A 12 12 0 0 1 26.39 22" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="16" r="3" fill={accent} />
    </svg>
  );
}
