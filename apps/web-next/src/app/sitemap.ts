import { MetadataRoute } from 'next';
import { getAllCards, getAllBanks } from '@/lib/api';
import { getNews } from '@/lib/news';
import { getArticles, generateAuthorSlug, tagLabels, type ArticleTag } from '@/lib/articles';
import { getBestPages } from '@/lib/best';
import { getAllStores } from '@/lib/stores';

// Required for static export
export const dynamic = 'force-static';

/**
 * Dynamic sitemap generation (#13)
 * Generates sitemap.xml from all cards at build time
 */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://creditodds.com';

  // Static pages — ordered by priority for crawlers
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/check-odds`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/explore`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/news`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.85,
    },
    {
      url: `${baseUrl}/articles`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${baseUrl}/best`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${baseUrl}/tools`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...[
      'chase-ultimate-rewards-to-usd',
      'amex-membership-rewards-to-usd',
      'capital-one-miles-to-usd',
      'citi-thankyou-points-to-usd',
      'bilt-rewards-points-to-usd',
      'united-miles-to-usd',
      'delta-skymiles-to-usd',
      'southwest-rapid-rewards-to-usd',
      'world-of-hyatt-points-to-usd',
      'marriott-bonvoy-points-to-usd',
      'hilton-honors-points-to-usd',
      'ihg-one-rewards-points-to-usd',
    ].map((slug) => ({
      url: `${baseUrl}/tools/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/how`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      // /best-card-for index — entry point for the per-store SEO pages.
      // Higher priority than the children since it's the discovery hub.
      url: `${baseUrl}/best-card-for`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.85,
    },
  ];

  // Dynamic card pages
  let cardPages: MetadataRoute.Sitemap = [];
  try {
    const cards = await getAllCards();
    cardPages = cards.map((card) => ({
      url: `${baseUrl}/card/${card.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch (error) {
    console.error('Error generating sitemap for cards:', error);
  }

  // Dynamic bank pages
  let bankPages: MetadataRoute.Sitemap = [];
  try {
    const banks = await getAllBanks();
    bankPages = banks.map((bank) => ({
      url: `${baseUrl}/bank/${encodeURIComponent(bank)}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch (error) {
    console.error('Error generating sitemap for banks:', error);
  }

  // Dynamic news article pages
  let newsPages: MetadataRoute.Sitemap = [];
  try {
    const newsItems = await getNews();
    newsPages = newsItems
      .filter((item) => item.body)
      .map((item) => ({
        url: `${baseUrl}/news/${item.id}`,
        lastModified: new Date(item.date),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }));
  } catch (error) {
    console.error('Error generating sitemap for news:', error);
  }

  // Dynamic article pages + category and author hubs
  let articlePages: MetadataRoute.Sitemap = [];
  let articleCategoryPages: MetadataRoute.Sitemap = [];
  let articleAuthorPages: MetadataRoute.Sitemap = [];
  try {
    const articleItems = await getArticles();
    articlePages = articleItems.map((item) => ({
      url: `${baseUrl}/articles/${item.slug}`,
      lastModified: new Date(item.updated_at || item.date),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    }));

    // Article category hubs — one per tag actually used
    const usedTags = new Set<ArticleTag>();
    for (const a of articleItems) for (const t of a.tags) usedTags.add(t);
    articleCategoryPages = Array.from(usedTags)
      .filter((t) => t in tagLabels)
      .map((tag) => ({
        url: `${baseUrl}/articles/category/${tag}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }));

    // Author hubs — one per unique author
    const authors = new Map<string, string>();
    for (const a of articleItems) {
      const slug = a.author_slug || generateAuthorSlug(a.author);
      if (!authors.has(slug)) authors.set(slug, a.author);
    }
    articleAuthorPages = Array.from(authors.keys()).map((slug) => ({
      url: `${baseUrl}/articles/author/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));
  } catch (error) {
    console.error('Error generating sitemap for articles:', error);
  }

  // Dynamic best pages
  let bestPages: MetadataRoute.Sitemap = [];
  try {
    const bestItems = await getBestPages();
    bestPages = bestItems.map((item) => ({
      url: `${baseUrl}/best/${item.slug}`,
      lastModified: new Date(item.updated_at || item.date),
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    }));
  } catch (error) {
    console.error('Error generating sitemap for best pages:', error);
  }

  // Dynamic /best-card-for/[slug] store pages
  let storePages: MetadataRoute.Sitemap = [];
  try {
    const stores = await getAllStores();
    storePages = stores.map((s) => ({
      url: `${baseUrl}/best-card-for/${s.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    }));
  } catch (error) {
    console.error('Error generating sitemap for store pages:', error);
  }

  return [
    ...staticPages,
    ...bankPages,
    ...cardPages,
    ...newsPages,
    ...articlePages,
    ...articleCategoryPages,
    ...articleAuthorPages,
    ...bestPages,
    ...storePages,
  ];
}
