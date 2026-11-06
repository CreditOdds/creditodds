'use client';
import manifest from './static-images.json';
const images = manifest as Record<string, string>;
export default function staticImageLoader({ src, width }: { src: string; width: number; quality?: number }): string {
  if (/\.svg(?:$|[?#])/i.test(src)) return src;
  const key = images[src];
  // A newly published API image is available after the next build. Never
  // silently download a multi-megabyte original when a variant is missing.
  if (!key) return '/assets/generic-card.svg';
  const size = [32, 96, 256, 640, 1200].find(w => w >= width) ?? 1200;
  return `/_images/${key}-${size}.webp`;
}
