// Re-export the OpenGraph image for Twitter cards
export { default, size, contentType } from './opengraph-image';

export const dynamic = 'force-static';
export { generateStaticParams } from './page';
export const dynamicParams = false;
