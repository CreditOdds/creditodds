import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const BEST_CDN_URL = 'https://d2hxvzw7msbtvt.cloudfront.net/best.json';

export async function GET() {
  try {
    // In development, read from local file
    if (process.env.NODE_ENV === 'development') {
      const filePath = path.join(process.cwd(), '..', '..', 'data', 'best.json');
      const fileContent = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContent);
      return NextResponse.json(data);
    }

    const res = await fetch(BEST_CDN_URL, {
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch best pages' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching best pages:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
