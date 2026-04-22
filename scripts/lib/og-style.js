/**
 * Shared v2 editorial styling for social-post images.
 *
 * Mirrors the palette used by the on-site OG images (components/og/og-utils.tsx)
 * so Twitter/LinkedIn/Reddit previews all read as one brand: ink canvas
 * (#1a1330), purple accent glow, emerald/warn for positive/negative movement.
 */

const V2 = {
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
  emerald: '#0c8450',
};

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Returns SVG fragments for the dark editorial background: ink canvas, a
 * purple accent radial glow top-right, a softer one bottom-left, and a subtle
 * mono dot grid. Caller splices `defs` into the `<defs>` block and `rects` at
 * the start of the canvas.
 */
function darkBackground({ width, height, accent = V2.accent, idSuffix = '' }) {
  const glowId = `v2glow${idSuffix}`;
  const glow2Id = `v2glow2${idSuffix}`;
  const dotsId = `v2dots${idSuffix}`;
  const defs = `
    <radialGradient id="${glowId}" cx="85%" cy="15%" r="55%">
      <stop offset="0%" stop-color="${hexToRgba(accent, 0.28)}"/>
      <stop offset="100%" stop-color="${hexToRgba(accent, 0)}"/>
    </radialGradient>
    <radialGradient id="${glow2Id}" cx="10%" cy="90%" r="50%">
      <stop offset="0%" stop-color="${hexToRgba(accent, 0.16)}"/>
      <stop offset="100%" stop-color="${hexToRgba(accent, 0)}"/>
    </radialGradient>
    <pattern id="${dotsId}" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.06)"/>
    </pattern>
  `;
  const rects = `
    <rect width="${width}" height="${height}" fill="${V2.ink}"/>
    <rect width="${width}" height="${height}" fill="url(#${dotsId})"/>
    <rect width="${width}" height="${height}" fill="url(#${glowId})"/>
    <rect width="${width}" height="${height}" fill="url(#${glow2Id})"/>
  `;
  return { defs, rects };
}

/**
 * Subtle hairline + muted-purple footer text. Caller positions a <g transform>
 * or embeds this directly at the footer Y offset.
 */
function footerBar({ width, y, height, text = 'creditodds.com' }) {
  return `
    <line x1="40" y1="${y}" x2="${width - 40}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <text x="${width / 2}" y="${y + Math.round(height / 2) + 6}" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="600" fill="${V2.muted}">${text}</text>
  `;
}

module.exports = {
  V2,
  hexToRgba,
  darkBackground,
  footerBar,
};
