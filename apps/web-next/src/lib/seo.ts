// SEO title length budget. Bing's audit flags titles over 60 chars; Google
// truncates around 580px (~60 chars). The root layout appends " | CreditOdds"
// (13 chars) via title.template, so per-page titles must stay under 47 to keep
// the rendered <title> ≤ 60. Use openGraph.title for the longer branded form.
export const TITLE_MAX = 47;

export function truncateTitle(title: string, max = TITLE_MAX): string {
  if (title.length <= max) return title;
  // Trim at the last word boundary that fits within max - 1 (room for ellipsis).
  const sliced = title.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? sliced.slice(0, lastSpace) : sliced;
  return base.replace(/[\s,;:.\-–—]+$/, '') + '…';
}
