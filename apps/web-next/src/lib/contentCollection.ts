import { fetchWithRetry } from './fetchWithRetry';

// A successful response whose body is not a valid catalog. Distinct from HTTP
// and transport failures, which fetchWithRetry has already retried.
class InvalidCatalogError extends Error {}

function parseCatalog<T>(text: string, name: string, key: string, identifier: string): T[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new InvalidCatalogError(`Invalid ${name} catalog: ${(error as Error).message}`);
  }
  const collection = data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(collection) || collection.some(item =>
    !item || typeof item !== 'object' || typeof item[identifier] !== 'string' || !item[identifier].trim()
  )) {
    throw new InvalidCatalogError(`Invalid ${name} catalog`);
  }
  return collection as T[];
}

// Only a successfully loaded, structurally valid catalog can establish that
// an individual slug is absent. Upstream 404s refer to the catalog itself.
export async function getContentCollection<T>(
  name: 'articles' | 'news' | 'best',
  key: 'articles' | 'items' | 'pages',
  identifier: 'slug' | 'id',
  signal?: AbortSignal,
): Promise<T[]> {
  const isBrowser = typeof window !== 'undefined';
  if (!isBrowser && process.env.NODE_ENV === 'development') {
    const fs = await import('fs/promises');
    const path = await import('path');
    return parseCatalog<T>(await fs.readFile(path.join(process.cwd(), '..', '..', 'data', `${name}.json`), 'utf8'), name, key, identifier);
  }
  const url = isBrowser ? `/api/${name}` : `https://d2hxvzw7msbtvt.cloudfront.net/${name}.json`;
  const load = async (target: string) => {
    const response = await fetchWithRetry(target, { signal, ...(isBrowser ? {} : { next: { revalidate: 300 } }) });
    if (!response.ok) throw new Error(`Failed to fetch ${name}: ${response.status}`);
    return parseCatalog<T>(await response.text(), name, key, identifier);
  };
  try {
    return await load(url);
  } catch (error) {
    if (!(error instanceof InvalidCatalogError)) throw error;
    signal?.throwIfAborted();
    // One garbled body (seen mid-transfer during an Amplify prerender) used to
    // fail the whole build. Refetch once under a fresh cache key, which also
    // misses the CDN edge copy; a catalog that is still invalid propagates.
    return load(`${url}?_=${Date.now()}`);
  }
}
