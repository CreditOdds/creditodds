// Re-export the OpenGraph image for Twitter cards
export { default, size, contentType } from './opengraph-image';

// Runtime must be defined directly, not re-exported
export const runtime = 'nodejs';

export const dynamic = 'force-static';
export { generateStaticParams } from './page';
export const dynamicParams = false;
