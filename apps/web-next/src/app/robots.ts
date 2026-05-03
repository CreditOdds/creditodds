import { MetadataRoute } from 'next';

// Required for static export
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://creditodds.com';

  // AI / LLM crawlers we want to surface our content to:
  // - GPTBot (OpenAI training), OAI-SearchBot (ChatGPT search), ChatGPT-User (live fetch)
  // - ClaudeBot / anthropic-ai (Anthropic training), Claude-Web (live fetch)
  // - PerplexityBot, Google-Extended (Gemini), CCBot (Common Crawl), Applebot-Extended
  // - Bytespider (TikTok/ByteDance), DuckAssistBot, Amazonbot, Meta-ExternalAgent
  const aiCrawlers = [
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Claude-Web',
    'anthropic-ai',
    'PerplexityBot',
    'Perplexity-User',
    'Google-Extended',
    'CCBot',
    'Applebot-Extended',
    'Bytespider',
    'DuckAssistBot',
    'Amazonbot',
    'Meta-ExternalAgent',
    'cohere-ai',
    'YouBot',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/profile', '/admin', '/api/', '/auth/'],
      },
      // Explicitly welcome AI crawlers — same allowlist as humans, just signaled clearly
      ...aiCrawlers.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: ['/profile', '/admin', '/api/', '/auth/'],
      })),
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
