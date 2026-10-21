import { fetchWithRetry } from './fetchWithRetry';

// Only a successfully loaded, structurally valid catalog can establish that
// an individual slug is absent. Upstream 404s refer to the catalog itself.
export async function getContentCollection<T>(
  name: 'articles' | 'news' | 'best',
  key: 'articles' | 'items' | 'pages',
  identifier: 'slug' | 'id',
): Promise<T[]> {
  const isBrowser = typeof window !== 'undefined';
  let data: unknown;
  if (!isBrowser && process.env.NODE_ENV === 'development') {
    const fs = await import('fs/promises');
    const path = await import('path');
    data = JSON.parse(await fs.readFile(path.join(process.cwd(), '..', '..', 'data', `${name}.json`), 'utf8'));
  } else {
    const url = isBrowser ? `/api/${name}` : `https://d2hxvzw7msbtvt.cloudfront.net/${name}.json`;
    const response = await fetchWithRetry(url, isBrowser ? {} : { next: { revalidate: 300 } });
    if (!response.ok) throw new Error(`Failed to fetch ${name}: ${response.status}`);
    data = await response.json();
  }
  const collection = data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(collection) || collection.some(item =>
    !item || typeof item !== 'object' || typeof item[identifier] !== 'string' || !item[identifier].trim()
  )) {
    throw new Error(`Invalid ${name} catalog`);
  }
  return collection as T[];
}
