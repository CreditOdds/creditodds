import { getContentCollection } from '@/lib/contentCollection';
export const dynamic = 'force-static';
export async function GET() {
  const items = await getContentCollection('best', 'pages', 'slug');
  return Response.json({ pages: items, count: items.length });
}
