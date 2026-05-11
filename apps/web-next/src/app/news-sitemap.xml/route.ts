import { getNews } from '@/lib/news';

export const dynamic = 'force-static';
export const revalidate = 3600;

const BASE_URL = 'https://creditodds.com';
const PUBLICATION_NAME = 'CreditOdds';
const LANGUAGE = 'en';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const items = await getNews().catch(() => []);

  const twoDaysAgo = Date.now() - 1000 * 60 * 60 * 48;
  const recent = items
    .filter((item) => Boolean(item.body))
    .filter((item) => {
      const t = new Date(item.date).getTime();
      return Number.isFinite(t) && t >= twoDaysAgo;
    })
    .slice(0, 1000);

  const urls = recent
    .map((item) => {
      const loc = `${BASE_URL}/news/${item.id}`;
      const pubDate = new Date(item.date).toISOString();
      return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <news:news>
      <news:publication>
        <news:name>${PUBLICATION_NAME}</news:name>
        <news:language>${LANGUAGE}</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${escapeXml(item.title)}</news:title>
    </news:news>
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
