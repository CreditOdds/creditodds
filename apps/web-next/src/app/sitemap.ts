import { MetadataRoute } from 'next';
import { getAllCards, getAllBanks } from '@/lib/api';

// Required for static export
export const dynamic = 'force-static';

/**
 * Dynamic sitemap generation (#13)
 * Generates sitemap.xml from all cards at build time
 */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://creditodds.com';

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/explore`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
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
  ];

  // Dynamic card pages
  let cardPages: MetadataRoute.Sitemap = [];
  try {
    const cards = await getAllCards();
    cardPages = cards.map((card) => ({
      url: `${baseUrl}/card/${encodeURIComponent(card.card_name)}`,
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

  return [...staticPages, ...bankPages, ...cardPages];
}
