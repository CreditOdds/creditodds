import { NextResponse } from 'next/server';
import { getArticles } from '@/lib/articles';

export async function GET() {
  try {
    const articles = await getArticles();
    return NextResponse.json({ articles, count: articles.length });
  } catch (error) {
    console.error('Error fetching articles:', error);
    return NextResponse.json({ error: 'Articles are temporarily unavailable' }, { status: 503 });
  }
}
