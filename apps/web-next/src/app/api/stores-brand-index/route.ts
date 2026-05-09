// Slim brand index for client-side place-name -> store matching.
// Strips heavy fields (`intro`, `faq`, `also_earns`) so the wallet's
// "Best Card Here" lookup can ship a small payload to the browser.

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface StoresFileShape {
  stores: Array<{
    slug: string;
    name: string;
    aliases?: string[];
    categories: string[];
    co_brand_cards?: string[];
  }>;
}

export const revalidate = 3600;

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), '..', '..', 'data', 'stores.json');
    const fileContent = await fs.readFile(filePath, 'utf8');
    const data: StoresFileShape = JSON.parse(fileContent);
    const slim = (data.stores || []).map((s) => ({
      slug: s.slug,
      name: s.name,
      aliases: s.aliases,
      categories: s.categories,
      co_brand_cards: s.co_brand_cards,
    }));
    return NextResponse.json({ stores: slim });
  } catch (error) {
    console.error('Error loading stores brand index:', error);
    return NextResponse.json(
      { error: 'Failed to load stores brand index' },
      { status: 500 },
    );
  }
}
