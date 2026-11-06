import { getContentCollection } from '@/lib/contentCollection';
export const dynamic = 'force-static';
export async function GET() {
  const items = await getContentCollection('news', 'items', 'id');
  return Response.json({ items: items, count: items.length });
}
