import React from 'react';

// ── Color constants for OG images (hex equivalents of Tailwind classes) ──

export const NEWS_TAG_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  'new-card':       { bg: '#ecfdf5', text: '#047857', accent: '#10b981' },
  'discontinued':   { bg: '#fef2f2', text: '#b91c1c', accent: '#ef4444' },
  'bonus-change':   { bg: '#eff6ff', text: '#1d4ed8', accent: '#3b82f6' },
  'fee-change':     { bg: '#fffbeb', text: '#b45309', accent: '#f59e0b' },
  'benefit-change': { bg: '#f5f3ff', text: '#6d28d9', accent: '#8b5cf6' },
  'limited-time':   { bg: '#fff7ed', text: '#c2410c', accent: '#f97316' },
  'policy-change':  { bg: '#f8fafc', text: '#334155', accent: '#64748b' },
  'general':        { bg: '#eef2ff', text: '#4338ca', accent: '#6366f1' },
};

export const ARTICLE_TAG_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  'strategy':      { bg: '#f3e8ff', text: '#6b21a8', accent: '#a855f7' },
  'guide':         { bg: '#dbeafe', text: '#1e40af', accent: '#3b82f6' },
  'analysis':      { bg: '#dcfce7', text: '#166534', accent: '#22c55e' },
  'news-analysis': { bg: '#ffedd5', text: '#9a3412', accent: '#f97316' },
  'beginner':      { bg: '#ccfbf1', text: '#115e59', accent: '#14b8a6' },
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

export async function loadInterFonts(): Promise<{ name: string; data: ArrayBuffer; style: 'normal'; weight: 400 | 700 }[]> {
  // Satori requires TTF format (not woff2)
  const [regular, bold] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf').then(r => r.arrayBuffer()),
    fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf').then(r => r.arrayBuffer()),
  ]);

  return [
    { name: 'Inter', data: regular, style: 'normal' as const, weight: 400 as const },
    { name: 'Inter', data: bold, style: 'normal' as const, weight: 700 as const },
  ];
}

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

// ── OGBackground component ──

export function OGBackground({
  children,
  accentColor,
}: {
  children: React.ReactNode;
  accentColor?: string;
}) {
  const warmGlow = accentColor || '#f59e0b';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background: 'linear-gradient(135deg, #3730A3 0%, #504DE1 30%, #7C3AED 60%, #4F46E5 100%)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Dot grid pattern overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          display: 'flex',
        }}
      />

      {/* Cool indigo glow — top left */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: 'radial-gradient(circle at 15% 20%, rgba(99,102,241,0.4) 0%, transparent 50%)',
          display: 'flex',
        }}
      />

      {/* Warm accent glow — bottom right */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `radial-gradient(circle at 85% 80%, ${hexToRgba(warmGlow, 0.25)} 0%, transparent 50%)`,
          display: 'flex',
        }}
      />

      {/* Thin white inset border */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          bottom: 12,
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 16,
          display: 'flex',
        }}
      />

      {/* Content */}
      {children}
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
