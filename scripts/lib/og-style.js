/**
 * Shared editorial styling for social-post images.
 *
 * Mirrors the dark "Social Card Templates" design system:
 *   - Deep ink canvas (#0d0a1a) with dot-grid backdrop and tone-tinted radial glow
 *   - Tone variants: purple (default), good (green), warn (red/pink), gold
 *   - Inter Tight display + JetBrains Mono eyebrows/numbers (we substitute Arial
 *     for missing system fonts inside the SVG renderer; sharp/librsvg is happy)
 *   - Branded footer with concentric-ring brand mark, "creditodds.com/path", meta
 *
 * The legacy V2 palette and helpers (darkBackground/footerBar) are preserved so
 * existing call-sites that haven't been migrated keep rendering.
 */

// ── Legacy v2 paper palette (still used by the on-site OG images) ──
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

// ── Social-card design palette (matches social-cards.css `:root` tokens) ──
const SO = {
  paper:    '#0d0a1a',
  paper2:   '#13101f',
  card:     '#15122a',
  card2:    '#1a1538',
  line:     '#241d3a',
  line2:    '#362d52',
  ink:      '#f4f1ff',
  ink2:     '#cfc8e4',
  muted:    '#8d85a8',
  muted2:   '#5a5270',
  accent:   '#b794ff',
  accent2:  '#2a1a52',
  accent3:  '#6d3fe8',
  warn:     '#ff7aa3',
  warn2:    '#2d0a1a',
  good:     '#3eccaa',
  good2:    '#0a2a23',
  gold:     '#f0c85a',
  gold2:    '#2a200a',
};

// ── Tone variants (radial glow + hairline + tag chip styling per template) ──
const TONES = {
  purple: { accent: SO.accent, glow: 'rgba(109,63,232,0.42)', hair: SO.accent, tagBg: SO.accent2, tagText: SO.accent, tagBorder: 'rgba(183,148,255,0.30)' },
  good:   { accent: SO.good,   glow: 'rgba(62,204,170,0.32)', hair: SO.good,   tagBg: SO.good2,   tagText: SO.good,   tagBorder: 'rgba(62,204,170,0.30)' },
  warn:   { accent: SO.warn,   glow: 'rgba(255,122,163,0.32)',hair: SO.warn,   tagBg: SO.warn2,   tagText: SO.warn,   tagBorder: 'rgba(255,122,163,0.30)' },
  gold:   { accent: SO.gold,   glow: 'rgba(240,200,90,0.28)', hair: SO.gold,   tagBg: SO.gold2,   tagText: SO.gold,   tagBorder: 'rgba(240,200,90,0.30)' },
};

function getTone(name) {
  return TONES[name] || TONES.purple;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy backdrop (paper/ink hybrid) — kept for backward compat
// ─────────────────────────────────────────────────────────────────────────────

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

function footerBar({ width, y, height, text = 'creditodds.com' }) {
  return `
    <line x1="40" y1="${y}" x2="${width - 40}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <text x="${width / 2}" y="${y + Math.round(height / 2) + 6}" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="600" fill="${V2.muted}">${text}</text>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Social-card frame (the design system used by Card Wire / Best Rankings)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns SVG fragments for the design's deep-purple frame:
 *   - solid ink fill (#0d0a1a)
 *   - tone-tinted radial glow upper-right + soft accent glow lower-left
 *   - subtle dot-grid overlay
 *   - 1px inset accent border (the "soft contained card" hint)
 *   - hairline accent (96×3px) at top-left in the tone color
 *
 * Caller splices `defs` into `<defs>` and `rects` at the start of the canvas.
 */
function soFrame({ width, height, tone = 'purple', idSuffix = '' }) {
  const t = getTone(tone);
  const glowId = `soglow${idSuffix}`;
  const glow2Id = `soglow2${idSuffix}`;
  const dotsId = `sodots${idSuffix}`;

  const defs = `
    <radialGradient id="${glowId}" cx="90%" cy="10%" r="65%">
      <stop offset="0%" stop-color="${t.glow}"/>
      <stop offset="60%" stop-color="${t.glow.replace(/[\d.]+\)$/, '0)')}"/>
    </radialGradient>
    <radialGradient id="${glow2Id}" cx="0%" cy="100%" r="55%">
      <stop offset="0%" stop-color="rgba(183,148,255,0.10)"/>
      <stop offset="55%" stop-color="rgba(183,148,255,0)"/>
    </radialGradient>
    <pattern id="${dotsId}" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="rgba(183,148,255,0.07)"/>
    </pattern>
  `;
  const rects = `
    <rect width="${width}" height="${height}" fill="${SO.paper}"/>
    <rect width="${width}" height="${height}" fill="url(#${dotsId})"/>
    <rect width="${width}" height="${height}" fill="url(#${glowId})"/>
    <rect width="${width}" height="${height}" fill="url(#${glow2Id})"/>
    <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="rgba(183,148,255,0.06)" stroke-width="1"/>
    <rect x="64" y="0" width="96" height="3" rx="0" ry="0" fill="${t.hair}"/>
  `;
  return { defs, rects };
}

/**
 * The shared brand footer band that anchors every social card. Renders:
 *   - 1px top border in --so-line
 *   - Wordmark on the left (concentric-ring brand mark + "Credit" + accent "Odds")
 *   - URL + optional meta on the right (mono caps, accent-colored path segment)
 *
 * The footer is 56px tall in the design and sits flush at the bottom.
 */
function soFooter({ width, height = 56, y, sectionPath = '', meta = '', tone = 'purple' }) {
  const t = getTone(tone);
  const padX = 56;
  const cy = y + height / 2;

  // Brand mark — concentric "odds meter" ring
  const markSize = 22;
  const markX = padX;
  const markY = cy - markSize / 2;
  const markCenterX = markX + markSize / 2;
  const markCenterY = markY + markSize / 2;
  const markR = markSize / 2 - 1;
  const markArcR = markR - 1;

  // Compute arc end point (90° → 270° = three-quarters of the way clockwise from top)
  // We trace from 12 o'clock to 4 o'clock (= 120deg arc) for the accent stroke
  const arcStart = { x: markCenterX, y: markCenterY - markArcR };
  const arcEnd = {
    x: markCenterX + markArcR * Math.cos((-30 * Math.PI) / 180),
    y: markCenterY + markArcR * Math.sin((-30 * Math.PI) / 180),
  };
  const brandMarkSvg = `
    <g>
      <circle cx="${markCenterX}" cy="${markCenterY}" r="${markR}" fill="none" stroke="${SO.ink}" stroke-opacity="0.25" stroke-width="1.5"/>
      <path d="M ${arcStart.x} ${arcStart.y} A ${markArcR} ${markArcR} 0 0 1 ${arcEnd.x} ${arcEnd.y}" fill="none" stroke="${t.accent}" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="${markCenterX}" cy="${markCenterY}" r="2.2" fill="${t.accent}"/>
    </g>
  `;

  // Wordmark text — placed right of the mark
  const wordX = markX + markSize + 10;
  const wordmark = `
    <text x="${wordX}" y="${cy + 6}" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="${SO.ink}" letter-spacing="-0.3">Credit<tspan fill="${t.accent}" font-weight="500">Odds</tspan></text>
  `;

  // Right side: URL + optional divider + meta (mono caps)
  // creditodds.com/<path>  ·  meta
  const rightX = width - padX;
  const urlPath = sectionPath ? `creditodds.com/${sectionPath}` : 'creditodds.com';
  const metaText = meta ? meta.toUpperCase() : '';

  // Right-side text uses tspans for color segments. Render with text-anchor="end"
  // and chunk by approximate width: we measure conservatively by character count.
  const urlSvg = sectionPath
    ? `<tspan fill="${SO.ink2}">creditodds.com</tspan><tspan fill="${SO.muted}" dx="2"> / </tspan><tspan fill="${t.accent}" dx="2">${escapeXml(sectionPath)}</tspan>`
    : `<tspan fill="${SO.ink2}">creditodds.com</tspan>`;

  let rightContent = '';
  if (metaText) {
    rightContent = `
      <text x="${rightX}" y="${cy + 5}" text-anchor="end" font-family="Menlo,Consolas,monospace" font-size="12" fill="${SO.muted}" letter-spacing="1.2">${escapeXml(metaText)}</text>
      <line x1="${rightX - estimateTextWidth(metaText, 12, true) - 18}" y1="${cy - 7}" x2="${rightX - estimateTextWidth(metaText, 12, true) - 18}" y2="${cy + 7}" stroke="${SO.line2}" stroke-width="1"/>
      <text x="${rightX - estimateTextWidth(metaText, 12, true) - 28}" y="${cy + 5}" text-anchor="end" font-family="Menlo,Consolas,monospace" font-size="13" letter-spacing="0.4">${urlSvg}</text>
    `;
  } else {
    rightContent = `
      <text x="${rightX}" y="${cy + 5}" text-anchor="end" font-family="Menlo,Consolas,monospace" font-size="13" letter-spacing="0.4">${urlSvg}</text>
    `;
  }

  void urlPath;

  return `
    <rect x="0" y="${y}" width="${width}" height="${height}" fill="rgba(7,5,15,0.55)"/>
    <line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${SO.line}" stroke-width="1"/>
    ${brandMarkSvg}
    ${wordmark}
    ${rightContent}
  `;
}

/**
 * Mono eyebrow row: "<KEY> · <text>" with the key in the tone accent.
 * Mirrors `.so-eyebrow` from the design.
 */
function soEyebrow({ x, y, key, text, tone = 'purple', size = 14 }) {
  const t = getTone(tone);
  const keyText = key ? `<tspan fill="${t.accent}" font-weight="600">${escapeXml(key)}</tspan>` : '';
  const sep = key && text ? `<tspan fill="${SO.muted2}" dx="6"> · </tspan>` : '';
  const tail = text ? `<tspan fill="${SO.muted}" dx="6">${escapeXml(text)}</tspan>` : '';
  return `<text x="${x}" y="${y}" font-family="Menlo,Consolas,monospace" font-size="${size}" letter-spacing="1.4" font-weight="500">${keyText}${sep}${tail}</text>`;
}

/**
 * Render the design's mini "card art" placeholder when we don't have a real
 * card image — solid gradient swatch with chip + network text. Used for slots
 * where we want the design to read even if a CDN fetch failed.
 */
function soArtPlaceholderSvg({ x, y, w, h, palette = 'purple', name = '', network = '' }) {
  const palettes = {
    discover:    ['#4d4d56', '#2d2d3a'],
    quicksilver: ['#c8ccd0', '#8d9097'],
    'bofa-red':  ['#b81c2f', '#6e0e1c'],
    'platinum-co': ['#1a3a6e', '#0a1f3e'],
    'citi-blue': ['#2d8fc7', '#0d4070'],
    atmos:       ['#1a2540', '#0a1530'],
    aadvantage:  ['#d0d4d8', '#9ea3aa'],
    bilt:        ['#2a2a2a', '#060606'],
    purple:      ['#6d3fe8', '#2a1a52'],
  };
  const [g1, g2] = palettes[palette] || palettes.purple;
  const lightOnDark = !['quicksilver', 'aadvantage'].includes(palette);
  const txtColor = lightOnDark ? 'rgba(255,255,255,0.85)' : '#2d2d3a';
  const gradId = `pal-${palette}-${Math.random().toString(36).slice(2, 8)}`;

  return `
    <defs>
      <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${g1}"/>
        <stop offset="100%" stop-color="${g2}"/>
      </linearGradient>
    </defs>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(14, h * 0.06)}" fill="url(#${gradId})"/>
    <rect x="${x + w * 0.12}" y="${y + h * 0.36}" width="${w * 0.14}" height="${h * 0.28}" rx="3" fill="#d6c280"/>
    ${name ? `<text x="${x + w - w * 0.08}" y="${y + h * 0.22}" text-anchor="end" font-family="Arial,sans-serif" font-size="${Math.round(h * 0.09)}" font-weight="500" fill="${txtColor}">${escapeXml(String(name).slice(0, 32))}</text>` : ''}
    ${network ? `<text x="${x + w - w * 0.08}" y="${y + h - h * 0.12}" text-anchor="end" font-family="Arial,sans-serif" font-size="${Math.round(h * 0.11)}" font-weight="700" fill="${txtColor}" letter-spacing="0.5">${escapeXml(network)}</text>` : ''}
  `;
}

// ── Naive width estimator for monospace at a given px size ──
function estimateTextWidth(str, fontSize, isMonospace = false) {
  // Mono ~ 0.6 em per char. Sans ~ 0.55. Caps adds ~5%.
  const factor = isMonospace ? 0.62 : 0.56;
  return Math.ceil(String(str).length * fontSize * factor);
}

module.exports = {
  // Legacy palette + helpers
  V2,
  hexToRgba,
  darkBackground,
  footerBar,
  // Social-card design system
  SO,
  TONES,
  getTone,
  escapeXml,
  soFrame,
  soFooter,
  soEyebrow,
  soArtPlaceholderSvg,
  estimateTextWidth,
};
