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

  // NOTE: '/auth/' used to be listed here and never did anything — (auth) is an
  // App Router route *group*, so it is stripped from the URL and no request path
  // ever starts with /auth/. The pages it was meant to cover live at /login,
  // /register and /forgot.
  //
  // Do NOT add /login here to "fix" the duplicate-URL reports in Search Console.
  // /login is deliberately left crawlable so Googlebot can reach it and read the
  // noindex in app/(auth)/layout.tsx. A Disallow would block the crawl, the
  // noindex would never be seen, and the already-discovered
  // /login?redirect=... URLs would stay stuck in the index reports indefinitely.
  const disallow = ['/profile', '/admin', '/api/'];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
      // Explicitly welcome AI crawlers — same allowlist as humans, just signaled clearly
      ...aiCrawlers.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow,
      })),
    ],
    sitemap: [`${baseUrl}/sitemap.xml`, `${baseUrl}/news-sitemap.xml`],
    host: baseUrl,
  };
}
