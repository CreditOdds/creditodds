import React from 'react';

// ── v2 palette anchors (match .landing-v2 CSS tokens) ──
// --ink: #1a1330, --accent: #6d3fe8, --accent-2: #f0e9ff, --paper: #ffffff,
// --paper-2: #f7f5fc, --line: #ece8f5, --warn: #d23a62, --gold: #a8792a

export const V2 = {
  ink: '#1a1330',
  ink2: '#3a2f55',
  accent: '#6d3fe8',
  accent2: '#f0e9ff',
  paper: '#ffffff',
  paper2: '#f7f5fc',
  line: '#ece8f5',
  line2: '#ddd7ec',
  muted: '#6b6384',
  warn: '#d23a62',
  gold: '#a8792a',
} as const;

// ── Color constants for OG images (aligned with v2 accent palette) ──
// Structure preserved for backward compat — each tag has a soft bg (used as chip),
// a text color (readable against bg), and an accent (used as subtle glow hint).

export const NEWS_TAG_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  'new-card':       { bg: '#e6f7ee', text: '#0c8450', accent: '#0c8450' }, // emerald (positive)
  'discontinued':   { bg: '#ffe6ed', text: '#d23a62', accent: '#d23a62' }, // warn
  'bonus-change':   { bg: '#f0e9ff', text: '#6d3fe8', accent: '#6d3fe8' }, // accent
  'fee-change':     { bg: '#faf0d9', text: '#a8792a', accent: '#a8792a' }, // gold
  'benefit-change': { bg: '#f0e9ff', text: '#6d3fe8', accent: '#6d3fe8' }, // accent
  'limited-time':   { bg: '#faf0d9', text: '#a8792a', accent: '#a8792a' }, // gold
  'policy-change':  { bg: '#f7f5fc', text: '#3a2f55', accent: '#6b6384' }, // neutral
  'general':        { bg: '#f7f5fc', text: '#3a2f55', accent: '#6b6384' }, // neutral
};

export const ARTICLE_TAG_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  'strategy':      { bg: '#f0e9ff', text: '#6d3fe8', accent: '#6d3fe8' }, // accent
  'guide':         { bg: '#f7f5fc', text: '#3a2f55', accent: '#6b6384' }, // neutral
  'analysis':      { bg: '#e6f7ee', text: '#0c8450', accent: '#0c8450' }, // emerald
  'news-analysis': { bg: '#faf0d9', text: '#a8792a', accent: '#a8792a' }, // gold
  'beginner':      { bg: '#f0e9ff', text: '#6d3fe8', accent: '#6d3fe8' }, // accent
};

export const NEWS_TAG_LABELS: Record<string, string> = {
  'new-card': 'New Card',
  'discontinued': 'Discontinued',
  'bonus-change': 'Bonus Change',
  'fee-change': 'Fee Change',
  'benefit-change': 'Benefit Change',
  'limited-time': 'Limited Time',
  'policy-change': 'Policy Change',
  'general': 'General',
};

export const ARTICLE_TAG_LABELS: Record<string, string> = {
  'strategy': 'Strategy',
  'guide': 'Guide',
  'analysis': 'Analysis',
  'news-analysis': 'News Analysis',
  'beginner': 'Beginner',
};

// ── Format numbers for display ──

export function formatStatNumber(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    // Show one decimal if < 100k, otherwise round
    const formatted = k >= 100 ? Math.round(k).toString() : k.toFixed(1).replace(/\.0$/, '');
    return `${formatted}K+`;
  }
  return `${n}+`;
}

// ── Load Inter fonts from Google Fonts CDN ──
//
// Memoized per module instance — the Inter TTFs don't change, so refetching
// them on every OG request just burned latency. First request within a warm
// container pays the fetch cost; every subsequent OG render reuses the bytes.

type InterFonts = { name: string; data: ArrayBuffer; style: 'normal'; weight: 400 | 700 }[];
let interFontsPromise: Promise<InterFonts> | null = null;

export function loadInterFonts(): Promise<InterFonts> {
  if (!interFontsPromise) {
    // Satori requires TTF format (not woff2)
    interFontsPromise = Promise.all([
      fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf').then(r => r.arrayBuffer()),
      fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf').then(r => r.arrayBuffer()),
    ]).then(([regular, bold]) => [
      { name: 'Inter', data: regular, style: 'normal' as const, weight: 400 as const },
      { name: 'Inter', data: bold, style: 'normal' as const, weight: 700 as const },
    ]);
    // If the fetch fails, clear the cache so we retry next request.
    interFontsPromise.catch(() => { interFontsPromise = null; });
  }
  return interFontsPromise;
}

// ── Cache headers for ImageResponse ──
//
// Lets CloudFront cache OG images so social unfurlers get cached bytes in
// ~50ms instead of a 5s cold render. Content changes when the page data
// changes (bonus value, card fee, etc.) — s-maxage is short enough for edits
// to propagate within a week and stale-while-revalidate covers the rest.

export const OG_CACHE_HEADERS = {
  'cache-control': 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400',
};

// ── OGLogo component ──

export function OGLogo({ size = 48 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 180 180"
        style={{ marginRight: 12 }}
      >
        <ellipse cx="138.19" cy="63.59" rx="9" ry="10.38" fill="white" />
        <ellipse cx="161.11" cy="68.38" rx="7.02" ry="8.09" fill="white" />
        <ellipse cx="138.71" cy="97.12" rx="9" ry="10.38" fill="white" />
        <ellipse cx="161.63" cy="101.92" rx="7.02" ry="8.09" fill="white" />
        <path
          d="M114.57,53.6V33.17c0-4.47-3.53-7.45-6.66-5.63l-42.9,24.98c-1.7,0.99-2.8,3.2-2.8,5.63v17.29L114.57,53.6z"
          fill="white"
        />
        <path
          d="M62.22,91.14v30.3c0,3.41,2.12,6.17,4.73,6.17h42.9c2.61,0,4.73-2.76,4.73-6.17V74.71L62.22,91.14z"
          fill="white"
        />
      </svg>
      <span style={{ fontSize: Math.round(size * 0.67), fontWeight: 'bold', letterSpacing: -0.5, color: 'white' }}>
        CreditOdds
      </span>
    </div>
  );
}

// ── OGBackground component (v2 editorial style) ──
//
// Deep ink base (#1a1330) with a soft purple accent glow — matches the
// .landing-v2 aesthetic. Kept dark so white text in the 40+ call-sites still
// reads; social-preview contrast is also better on dark.

export function OGBackground({
  children,
  accentColor,
}: {
  children: React.ReactNode;
  accentColor?: string;
}) {
  const glow = accentColor || V2.accent;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: V2.paper2,
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 8,
      }}
    >
      {/* Inner rounded content area — editorial paper frame around ink canvas */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          position: 'relative',
          borderRadius: 16,
          overflow: 'hidden',
          background: V2.ink,
          boxShadow: `inset 0 0 0 1px ${hexToRgba('#ffffff', 0.06)}`,
        }}
      >
        {/* Subtle mono grid */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            display: 'flex',
          }}
        />

        {/* Primary purple accent glow — top right */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `radial-gradient(circle at 85% 15%, ${hexToRgba(
              glow,
              0.28
            )} 0%, transparent 55%)`,
            display: 'flex',
          }}
        />

        {/* Secondary cooler accent glow — bottom left */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `radial-gradient(circle at 10% 90%, ${hexToRgba(
              glow,
              0.16
            )} 0%, transparent 50%)`,
            display: 'flex',
          }}
        />

        {/* Content */}
        {children}
      </div>
    </div>
  );
}

// ── Helpers ──

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
