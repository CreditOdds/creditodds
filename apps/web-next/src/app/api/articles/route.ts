import { getContentCollection } from '@/lib/contentCollection';
export const dynamic = 'force-static';
export async function GET() {
  const items = await getContentCollection('articles', 'articles', 'slug');
  return Response.json({ articles: items, count: items.length });
}
